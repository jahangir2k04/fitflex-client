const express = require('express');
const cors = require('cors');
require('dotenv').config();
const jwt = require('jsonwebtoken');
const stripe = require('stripe')(process.env.PAYMENT_SECRET_KEY)
const app = express();
const port = process.env.PORT || 5000;

// middleware 
app.use(cors());
app.use(express.json());

// verify jwt 
const verifyJWT = (req, res, next) => {
    const authorization = req.headers.authorization;
    if (!authorization) {
        return res.status(401).send({ error: true, message: 'Unauthorized access' });
    }
    const token = authorization.split(' ')[1];

    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
            return res.status(401).send({ error: true, message: 'Unauthorized access' })
        }
        req.decoded = decoded;
        next();
    })
}


const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.wx1xaqv.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        await client.connect();

        const usersCollection = client.db('fitflexDB').collection('users');
        const classCollection = client.db('fitflexDB').collection('classes');
        const selectedClassCollection = client.db('fitflexDB').collection('selectedClasses');
        const paymentCollection = client.db('fitflexDB').collection('payments');


        // jwt related apis
        app.post('/jwt', (req, res) => {
            const user = req.body;
            const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });
            res.send({ token });
        })

        const verifyAdmin = async (req, res, next) => {
            const email = req.decoded.email;
            const query = { email: email };
            const user = await usersCollection.findOne(query);
            if (user?.role !== 'admin') {
                return res.status(403).send({ error: true, message: "forbidden access" })
            }
            next();
        }

        const verifyInstructor = async (req, res, next) => {
            const email = req.decoded.email;
            const query = { email: email };
            const user = await usersCollection.findOne(query);
            if (user?.role !== 'instructor') {
                return res.status(403).send({ error: true, message: "forbidden access" })
            }
            next();
        }

        const verifyStudent = async (req, res, next) => {
            const email = req.decoded.email;
            const query = { email: email };
            const user = await usersCollection.findOne(query);
            if (user?.role !== 'student') {
                return res.status(403).send({ error: true, message: "forbidden access" })
            }
            next();
        }


        // users related apis
        app.get('/users', verifyJWT, verifyAdmin, async (req, res) => {
            const result = await usersCollection.find().toArray();
            res.send(result);
        })

        app.post('/users', async (req, res) => {
            const user = req.body;
            const query = { email: user.email };
            const existingUser = await usersCollection.findOne(query);
            if (existingUser) {
                return res.send({ message: "user already exist" })
            }
            const result = await usersCollection.insertOne(user);
            res.send(result);
        })

        app.patch('/users/admin/:id', async (req, res) => {
            const id = req.params.id;
            const role = req.body.role;
            const filter = { _id: new ObjectId(id) };
            const updatedRole = {
                $set: {
                    role: role
                },
            };
            const result = await usersCollection.updateOne(filter, updatedRole);
            res.send(result);
        });

        // admin related apis
        app.get('/users/admin/:email', verifyJWT, async (req, res) => {
            const email = req.params.email;
            if (req.decoded.email !== email) {
                res.send({ admin: false })
            }
            const query = { email: email };
            const user = await usersCollection.findOne(query);
            const result = { admin: user?.role === 'admin' };
            res.send(result);
        })


        // Instructor related apis
        app.get('/users/instructor/:email', verifyJWT, async (req, res) => {
            const email = req.params.email;
            if (req.decoded.email !== email) {
                res.send({ instructor: false })
            }
            const query = { email: email };
            const user = await usersCollection.findOne(query);
            const result = { instructor: user?.role === 'instructor' };
            res.send(result);
        })

        app.get('/my-class', verifyJWT, verifyInstructor, async (req, res) => {
            const email = req.query.email;
            if (!email) {
                res.send([]);
            }
            const query = { email: email };
            const result = await classCollection.find(query).toArray();
            res.send(result);
        })

        app.get('/all-instructor', async (req, res) => {
            const query = { role: 'instructor' };
            const result = await usersCollection.find(query).toArray();
            res.send(result);
        })


        // class related apis
        app.get('/classes', async (req, res) => {
            const result = await classCollection.find().toArray();
            res.send(result);
        })

        app.post('/classes', verifyJWT, verifyInstructor, async (req, res) => {
            const newClass = req.body;
            const result = await classCollection.insertOne(newClass);
            res.send(result);
        })

        app.patch('/classes/status/:id', verifyJWT, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const status = req.body.status;
            const filter = { _id: new ObjectId(id) };
            const updatedStatus = {
                $set: {
                    status: status
                },
            };
            const result = await classCollection.updateOne(filter, updatedStatus);
            res.send(result);
        })

        app.patch('/classes/feedback/:id', verifyJWT, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const feedback = req.body.feedbackText;
            const filter = { _id: new ObjectId(id) };
            const updatedStatus = {
                $set: {
                    feedback: feedback
                },
            };
            const result = await classCollection.updateOne(filter, updatedStatus);
            res.send(result);
        })


        // student related apis
        app.get('/selected-class', verifyJWT, verifyStudent, async (req, res) => {
            const email = req.query.email;
            if (!email) {
                res.send([]);
            }
            const query = { email: email };
            const result = await selectedClassCollection.find(query).toArray();
            res.send(result);
        })

        app.get('/enrolled-class', verifyJWT, verifyStudent, async(req, res) => {
            const email = req.query.email;
            const query = {email : email};
            const result = await paymentCollection.find(query).sort({"date": -1}).toArray();
            res.send(result);
        })

        app.post('/selected-class', verifyJWT, verifyStudent, async (req, res) => {
            const selectedClass = req.body;
            const result = await selectedClassCollection.insertOne(selectedClass);
            res.send(result);
        })

        app.delete('/delete-class/:id', verifyJWT, verifyStudent, async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await selectedClassCollection.deleteOne(query);
            res.send(result);
        })


        // PAYMENT related apis
        app.post('/create-payment-intent', verifyJWT, verifyStudent, async (req, res) => {
            const { price } = req.body;
            const amount = parseInt(price * 100);
            const paymentIntent = await stripe.paymentIntents.create({
                currency: 'usd',
                amount: amount,
                payment_method_types: ['card']
            });
            res.send({
                clientSecret: paymentIntent.client_secret,
            })
        })

        app.post('/payments', verifyJWT, async (req, res) => {
            const payment = req.body;
            const id = payment.classId;
            const insertResult = await paymentCollection.insertOne(payment);

            const query = { classId: id };
            const deleteResult = await selectedClassCollection.deleteOne(query);

            const filter = {_id: new ObjectId(id)};
            const updatedSeats = {
                $set: {
                    seats: payment.seats - 1,
                    enrolled: payment.enrolled + 1,
                },
            };
            const updateResult = await classCollection.updateOne(filter, updatedSeats); 

            const filterEmail = {email: payment.instructorEmail};
            const updateStudent = {
                $inc: { totalStudent: 1 }
            }
            const options = { upsert: true};
            const studentResult = await usersCollection.updateOne(filterEmail, updateStudent, options);

            res.send({ insertResult, deleteResult, updateResult, studentResult });
        })


        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);



app.get('/', (req, res) => {
    res.send('FitFlex is running');
});

app.listen(port, () => {
    console.log(`FitFlex is running on port : ${port}`);
})