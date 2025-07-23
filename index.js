const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const admin = require("firebase-admin");

require("dotenv").config();

const stripe = require('stripe')(`${process.env.StripePass}`);

const app = express();
const port = process.env.PORT || 3000;

// middleware
app.use(cors());
app.use(express.json());

// firebase service
const decodedKey = Buffer.from(process.env.FB_Service, 'base64').toString('utf8');
const serviceAccount = JSON.parse(decodedKey);

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const uri = `mongodb+srv://${process.env.DB_NAME}:${process.env.DB_PASS}@fardin-dev-cluster.fucqdbt.mongodb.net/?retryWrites=true&w=majority&appName=fardin-dev-cluster`;

const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        // await client.connect();

        const usersCollection = client.db("teachflow").collection("users");
        const teacherCollection = client.db("teachflow").collection("teachers");
        const classesCollection = client.db("teachflow").collection("classes");
        const paymentCollection = client.db("teachflow").collection("payments");
        const enrollmentsCollection = client.db("teachflow").collection("enrollments");
        const feedbackCollection = client.db("teachflow").collection("feedback");

        // custom middlewares
        // for checking token
        const verifyFirebaseToken = async (req, res, next) => {
            const authHeader = req.headers.authorization;

            if (!authHeader || !authHeader.startsWith('Bearer ')) {
                return res.status(401).json({ message: 'Unauthorized: No token provided' });
            }
            const token = authHeader.split(' ')[1];
            if (!token) {
                return res.status(401).json({ message: 'Unauthorized Access' });
            }
            // verify the token
            try {
                const decodedToken = await admin.auth().verifyIdToken(token);
                req.decoded = decodedToken;
                req.user = decodedToken; // optional: attach user info
                next(); // proceed to route
            } catch (error) {
                console.error('Token verification failed:', error);
                return res.status(401).json({ message: 'Unauthorized: Invalid token' });
            }
        };
        // for checking admin
        const verifyAdmin = async (req, res, next) => {
            const userEmail = req.decoded?.email;
            if (!userEmail) {
                return res.status(403).json({ message: 'Forbidden: No email in token' });
            }
            try {
                const user = await usersCollection.findOne({ email: userEmail });

                if (!user || user.role !== 'admin') {
                    return res.status(403).json({ message: 'Forbidden: Admins only' });
                }
                // Passed all checks
                next();
            } catch (err) {
                console.error('Admin check failed:', err);
                res.status(500).json({ message: 'Server error during role verification' });
            }
        };
        // for checking teacher 
        const verifyTeacher = async (req, res, next) => {
            const userEmail = req.decoded?.email;
            if (!userEmail) {
                return res.status(403).json({ message: 'Forbidden: No email in token' });
            }
            try {
                const user = await usersCollection.findOne({ email: userEmail });

                if (!user || user.role !== 'teacher') {
                    return res.status(403).json({ message: 'Forbidden: teacher only' });
                }
                // Passed all checks
                next();
            } catch (err) {
                console.error('teacher check failed:', err);
                res.status(500).json({ message: 'Server error during role verification' });
            }
        };

        // get user by email(searching)
        app.get('/users/search', verifyFirebaseToken, async (req, res) => {
            const emailQuery = req.query.email;
            if (!emailQuery) {
                return res.status(400).send({ message: 'Email query is required' });
            }

            try {
                const user = await usersCollection.findOne({
                    email: { $regex: emailQuery, $options: 'i' }, // case-insensitive partial match
                });

                if (!user) {
                    return res.status(404).send({ message: 'User not found' });
                }

                res.send(user);
            } catch (err) {
                console.error('Failed to search user:', err);
                res.status(500).send({ message: 'Server error' });
            }
        });

        // ✅ Get user role by email
        app.get('/users/role', verifyFirebaseToken, async (req, res) => {
            const email = req.query.email;
            if (!email) {
                return res.status(400).send({ message: 'Email is required' });
            }

            try {
                const user = await usersCollection.findOne(
                    { email: email },
                    { projection: { role: 1 } } // return only role field
                );

                if (!user) {
                    return res.status(404).send({ message: 'User not found' });
                }

                res.send({ role: user.role });
            } catch (err) {
                console.error('Failed to fetch role:', err);
                res.status(500).send({ message: 'Server error' });
            }
        });

        // web user class count
        app.get('/website-stats', async (req, res) => {
            try {
                const userCount = await usersCollection.estimatedDocumentCount();
                const classCount = await classesCollection.estimatedDocumentCount();
                const enrollmentCount = await enrollmentsCollection.estimatedDocumentCount();

                res.send({
                    totalUsers: userCount,
                    totalClasses: classCount,
                    totalEnrollments: enrollmentCount,
                });
            } catch (err) {
                res.status(500).send({ message: 'Failed to fetch stats', error: err });
            }
        });

        // GET: Get all teacher requests (admin only)
        app.get('/teacher-requests', verifyFirebaseToken, verifyAdmin, async (req, res) => {
            const result = await teacherCollection.find().toArray();
            res.send(result);
        });

        // GET: Get teacher request status by email
        app.get('/teacher-request/:email', async (req, res) => {
            const email = req.params.email;
            const result = await teacherCollection.findOne({ email });
            res.send(result || {});
        });

        // Get all classes by teacher email
        app.get('/classes/teacher', verifyFirebaseToken, verifyTeacher, async (req, res) => {
            const email = req.query.email;
            const result = await classesCollection.find({ teacherEmail: email }).toArray();
            res.send(result);
        });

        // GET single class (for See Details page)
        app.get('/classes/:id', verifyFirebaseToken, async (req, res) => {
            const id = req.params.id;
            const result = await classesCollection.findOne({ _id: new ObjectId(id) });
            res.send(result);
        });

        // For classId field
        app.get('/classes/by-classId/:classId', verifyFirebaseToken, async (req, res) => {
            const id = req.params.classId;
            const result = await classesCollection.findOne({ classId: id });
            res.send(result);
        });

        // GET all classes for admin review
        app.get('/classes', verifyFirebaseToken, verifyAdmin, async (req, res) => {
            const result = await classesCollection.find().toArray();
            res.send(result);
        });

        // ✅ Get all approved classes with totalEnrollment count
        app.get('/approved-classes', async (req, res) => {
            try {
                const result = await classesCollection.aggregate([
                    {
                        $match: { status: 'approved' }
                    },
                    {
                        $lookup: {
                            from: 'enrollments', // ✅ matches your actual collection name
                            localField: 'classId',
                            foreignField: 'classId',
                            as: 'enrollments'
                        }
                    },
                    {
                        $addFields: {
                            totalEnrollment: { $size: '$enrollments' } // ✅ counts total enrollments
                        }
                    },
                    {
                        $project: {
                            enrollments: 0 // ❌ hides raw enrollments array (optional)
                        }
                    }
                ]).toArray();

                res.send(result);
            } catch (err) {
                console.error(err);
                res.status(500).send({ message: 'Failed to fetch approved classes', error: err.message });
            }
        });

        // get popular classes
        app.get('/popular-classes', async (req, res) => {
            try {
                const result = await classesCollection.aggregate([
                    {
                        $match: { status: 'approved' }
                    },
                    {
                        $lookup: {
                            from: 'enrollments',
                            localField: 'classId',
                            foreignField: 'classId',
                            as: 'enrollments'
                        }
                    },
                    {
                        $addFields: {
                            enrolledCount: { $size: '$enrollments' }
                        }
                    },
                    {
                        $sort: { enrolledCount: -1 }
                    },
                    {
                        $limit: 6
                    },
                    {
                        $project: {
                            enrollments: 0 // Optional: remove raw enrollments array
                        }
                    }
                ]).toArray();

                res.send(result);
            } catch (err) {
                console.error(err);
                res.status(500).send({ message: 'Failed to fetch popular classes' });
            }
        });

        // get payments
        app.get('/payments', verifyFirebaseToken, async (req, res) => {
            try {
                const userEmail = req.query.email;

                if (req.decoded.email !== userEmail) {
                    return res.status(403).json({ message: 'Forbidden Access!!' });
                };

                const query = userEmail ? { email: userEmail } : {};
                const options = { sort: { paidAt: -1 } };//latest first

                const payments = await paymentCollection.find(query, options).toArray();
                res.send(payments);
            } catch (error) {
                console.error("Error fetching payment history: ", error);
                res.status(500).send({ message: 'Failed to get payment' })
            }
        });

        // get enrolled classes
        app.get('/enrollments', verifyFirebaseToken, async (req, res) => {
            const email = req.query.email;
            if (!email) return res.status(400).send({ message: 'Missing email' });

            const enrollments = await enrollmentsCollection.find({ studentEmail: email }).toArray();

            // Optionally populate class info from classCollection if needed
            res.send(enrollments);
        });

        // Get total enrollments for a specific class
        app.get('/enrollments/count/:classId', verifyFirebaseToken, verifyTeacher, async (req, res) => {
            const { classId } = req.params;
            try {
                const count = await enrollmentsCollection.countDocuments({ classId });
                res.json({ totalEnrollment: count });
            } catch (error) {
                console.error('Error counting enrollments:', error);
                res.status(500).json({ error: 'Internal server error' });
            }
        });

        // Get all feedback (for admin)
        app.get('/feedback', async (req, res) => {
            try {
                const feedbacks = await feedbackCollection.find().toArray();
                res.json(feedbacks);
            } catch (error) {
                console.error('Error fetching feedback:', error);
                res.status(500).json({ error: 'Internal server error' });
            }
        });

        // collection user info
        app.post('/users', async (req, res) => {
            try {
                const { name, email, role, userCreatedAt, lastLogIn } = req.body;

                if (!email) {
                    return res.status(400).json({ message: 'Email is required' });
                }

                const existingUser = await usersCollection.findOne({ email });

                if (!existingUser) {
                    const newUser = {
                        name,
                        email,
                        role,
                        userCreatedAt,
                        lastLogIn,
                    };

                    const result = await usersCollection.insertOne(newUser);
                    return res.status(201).json(result);
                }
                // Optional: you could update `lastLogIn` if user already exists
                await usersCollection.updateOne(
                    { email },
                    { $set: { lastLogIn: lastLogIn || new Date().toISOString() } }
                );

                return res.status(200).json(existingUser); // already exists
            } catch (err) {
                console.error('Error in upsert user:', err);
                res.status(500).json({ message: 'Server error' });
            }
        });

        // POST: Submit new teacher request
        app.post('/teacher-request', async (req, res) => {
            const request = req.body;
            const existing = await teacherCollection.findOne({ email: request.email });

            if (existing) {
                return res.status(400).send({ message: 'You already applied.' });
            }

            const result = await teacherCollection.insertOne(request);
            res.send(result);
        });

        // post submit class request
        app.post('/classes', verifyFirebaseToken, verifyTeacher, async (req, res) => {
            const classData = req.body;

            if (!classData || !classData.teacherEmail) {
                return res.status(400).send({ message: 'Invalid class data' });
            }

            classData.createdAt = new Date();

            const result = await classesCollection.insertOne(classData);
            res.send(result);
        });

        // stripe payment post
        app.post('/create-payment-intent', verifyFirebaseToken, async (req, res) => {
            const amount = req.body.amount;
            try {
                const paymentIntent = await stripe.paymentIntents.create({
                    amount: amount, //amount in cents
                    currency: 'usd',
                    payment_method_types: ['card'],
                });
                res.json({ clientSecret: paymentIntent.client_secret })
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // record post for payment and update class status
        app.post('/payments', verifyFirebaseToken, async (req, res) => {
            try {
                const { classId, email, amount, paymentMethod, transactionId, userName } = req.body;

                if (!classId || !email || !amount) {
                    return res.status(400).send({ message: 'Required fields missing: classId, email, amount, userId' });
                }

                const paymentData = {
                    classId,
                    email,
                    amount,
                    paymentMethod,
                    transactionId,
                    paidAt: new Date(),
                    paidAtString: new Date().toISOString(),
                };

                const paymentResult = await paymentCollection.insertOne(paymentData);

                // Create enrollment after payment
                const enrollmentData = {
                    studentEmail: email,
                    classId,
                    enrolledAt: new Date(),
                    paymentInfo: {
                        transactionId,
                        method: paymentMethod,
                        amount,
                        paidAt: new Date(),
                    },
                    review: null, // will be added later
                };

                const enrollmentResult = await enrollmentsCollection.insertOne(enrollmentData);

                res.status(200).send({
                    message: 'Payment & enrollment successful',
                    paymentId: paymentResult.insertedId,
                    enrollmentId: enrollmentResult.insertedId,
                });
            } catch (error) {
                console.error('❌ Payment processing failed:', error);
                res.status(500).send({ message: 'Failed to record payment/enrollment' });
            }
        });

        // Submit feedback
        app.post('/feedback', verifyFirebaseToken, async (req, res) => {
            try {
                const { classId, title, student, image, rating, comment } = req.body;

                if (!classId || !title || !student || rating == null || !comment) {
                    return res.status(400).json({ error: 'All fields are required' });
                };

                // Check if student already submitted feedback for this class
                const existingFeedback = await feedbackCollection.findOne({
                    classId: classId,
                    'student': student // Assuming student has an email field
                });

                if (existingFeedback) {
                    return res.status(409).json({
                        error: 'You have already submitted feedback for this class'
                    });
                };

                const newFeedback = {
                    classId,
                    className: title,
                    student,
                    image,
                    rating: Number(rating),
                    comment,
                    createdAt: new Date(),
                };

                const result = await feedbackCollection.insertOne(newFeedback);

                res.status(201).json({
                    message: 'Feedback submitted successfully',
                    feedbackId: result.insertedId
                });
            } catch (error) {
                console.error('Error submitting feedback:', error);
                res.status(500).json({ error: 'Internal server error' });
            }
        });

        // submit assignment
        app.post('/assignments/submit', verifyFirebaseToken, async (req, res) => {
            try {
                const {
                    classId,
                    assignmentIndex,
                    studentEmail,
                    studentName,
                    submissionText
                } = req.body;

                const classObjectId = classId;
                const assignmentPath = `assignments.${assignmentIndex}`;

                const updateResult = await classesCollection.updateOne(
                    { classId: classObjectId }, // Correct usage
                    {
                        $push: {
                            [`${assignmentPath}.submissions`]: {
                                studentEmail,
                                studentName,
                                submissionText,
                                submittedAt: new Date()
                            }
                        },
                        $inc: {
                            [`${assignmentPath}.submissionCount`]: 1,
                            totalSubmissions: 1
                        }
                    }
                );

                if (updateResult.modifiedCount === 0) {
                    return res.status(404).json({ error: 'Assignment not found' });
                }

                res.json({ success: true });
            } catch (error) {
                console.error('Error submitting assignment:', error);
                res.status(500).json({ error: 'Internal server error' });
            }
        });

        // change role to student
        app.patch('/users/role/self', verifyFirebaseToken, async (req, res) => {
            const { role, email } = req.body;

            // if (!["student"].includes(role)) {
            //     return res.status(400).send({ message: 'Invalid role' });
            // }

            try {
                const result = await usersCollection.updateOne(
                    { email },
                    { $set: { role } }
                );

                if (result.modifiedCount === 0) {
                    return res.status(404).send({ message: 'User not found or role unchanged' });
                }

                res.send({ message: 'Role updated to student', modifiedCount: result.modifiedCount });
            } catch (error) {
                console.error(error);
                res.status(500).send({ message: 'Role update failed' });
            }
        });

        // PATCH: Re-apply for teacher request (update status to pending)
        app.patch('/teacher-request/:email', async (req, res) => {
            const email = req.params.email;
            const result = await teacherCollection.updateOne(
                { email },
                { $set: { status: 'pending' } }
            );
            res.send(result);
        });

        // PATCH: Admin approves/rejects request & update user role
        app.patch('/update-status/:id', verifyFirebaseToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const { status } = req.body;

            const application = await teacherCollection.findOne({ _id: new ObjectId(id) });
            if (!application) return res.status(404).send({ message: "Application not found" });

            const result = await teacherCollection.updateOne(
                { _id: new ObjectId(id) },
                { $set: { status } }
            );

            // If approved, update user role in userCollection
            if (status === 'approved') {
                await usersCollection.updateOne(
                    { email: application.email },
                    { $set: { role: 'teacher' } }
                );
            }

            res.send(result);
        });

        // edit user role for admin
        app.patch('/users/:id', verifyFirebaseToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const { role } = req.body;

            if (!["admin", "user"].includes(role)) {
                return res.status(400).send({ message: 'Role is invalid!' });
            }

            try {
                const result = await usersCollection.updateOne(
                    { _id: new ObjectId(id) },
                    { $set: { role } }
                );

                if (result.modifiedCount === 0) {
                    return res.status(404).send({
                        message: 'User not found or role unchanged',
                        modifiedCount: result.modifiedCount
                    });
                }

                res.send({
                    message: `User role updated to ${role}`,
                    modifiedCount: result.modifiedCount
                });
            } catch (err) {
                console.error('Failed to update user role:', err);
                res.status(500).send({
                    message: 'Failed to update role',
                    modifiedCount: 0
                });
            }
        });

        // PATCH to update class details (e.g., title, price)
        app.patch('/update-class/:id', verifyFirebaseToken, verifyTeacher, async (req, res) => {
            const id = req.params.id;
            const updatedData = req.body;

            const result = await classesCollection.updateOne(
                { _id: new ObjectId(id) },
                { $set: updatedData }
            );

            res.send(result);
        });

        // PATCH: Update class status
        app.patch('/classes/update-status/:id', verifyFirebaseToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const { status } = req.body;

            const result = await classesCollection.updateOne(
                { _id: new ObjectId(id) },
                { $set: { status } }
            );
            res.send(result);
        });

        // Patch Add assignment inside class (embedded)
        app.patch('/classes/add-assignment/:id', verifyFirebaseToken, verifyTeacher, async (req, res) => {
            const classId = req.params.id;
            const assignment = req.body;
            assignment.createdAt = new Date();

            try {
                const result = await classesCollection.updateOne(
                    { _id: new ObjectId(classId) },
                    { $push: { assignments: assignment } }
                );
                res.send(result);
            } catch (err) {
                res.status(500).send({ message: 'Failed to add assignment', error: err });
            }
        });

        // PATCH /enrollments/:classId/feedback
        app.patch('/enrollments/:classId/feedback', async (req, res) => {
            const classId = req.params.classId;
            const userEmail = req.user.email;
            const feedback = req.body;

            const filter = { classId, userEmail };
            const updateDoc = {
                $set: {
                    feedback: {
                        ...feedback,
                    },
                },
            };

            const result = await enrollmentsCollection.updateOne(filter, updateDoc);
            res.send(result);
        });

        // DELETE a class
        app.delete('/classes/:id', verifyFirebaseToken, verifyTeacher, async (req, res) => {
            const id = req.params.id;
            const result = await classesCollection.deleteOne({ _id: new ObjectId(id) });
            res.send(result);
        });

        await client.db("admin").command({ ping: 1 })
        console.log("Pinned the deployment.Mongo and server connected!")
    } finally {
        // await client.close();
    }
}
run().catch(console.dir);

app.get('/', (req, res) => {
    res.send("Hello! 1,2,3... TeachFlow server is running!")
});

app.listen(port, () => {
    console.log(`Port ${port} is going on!`)
});