const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
const { v4: uuidv4 } = require('uuid');

// Firebase Admin via JSON
const serviceAccount = require('./eventease-202e2-firebase-adminsdk-fbsvc-7d176d434e.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
// -------------------- Helpers --------------------
function serverError(res, error) {
  console.error(error);
  return res.status(500).json({ error: 'Internal server error' });
}

// Log activity to live feed
async function logActivity(type, payload) {
  try {
    await db.collection('activityFeed').add({
      type,
      payload,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
  } catch (err) {
    console.error('Activity log failed:', err.message);
  }
}

// =======================================================
// AUTHENTICATION ROUTES
// =======================================================

// Register user
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    if (!name || !email || !password || !role) {
      return res.status(400).json({ error: 'All fields required' });
    }

    if (!['student', 'organizer'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    const user = await admin.auth().createUser({
      email,
      password,
      displayName: name
    });

    await db.collection('users').doc(user.uid).set({
      name,
      email,
      role,
      registeredEvents: [],
      bookmarkedEvents: [],
      preferences: [],
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    await logActivity('USER_REGISTERED', { userId: user.uid, role });

    res.status(201).json({ message: 'User registered', uid: user.uid });
  } catch (err) {
    serverError(res, err);
  }
});

// Login user (custom token)
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, role } = req.body;

    const user = await admin.auth().getUserByEmail(email);
    const userDoc = await db.collection('users').doc(user.uid).get();

    if (!userDoc.exists) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (userDoc.data().role !== role) {
      return res.status(403).json({ error: 'Incorrect role login' });
    }

    const token = await admin.auth().createCustomToken(user.uid);

    res.json({
      token,
      user: {
        uid: user.uid,
        ...userDoc.data()
      }
    });
  } catch (err) {
    serverError(res, err);
  }
});

// =======================================================
// HEALTH CHECK
// =======================================================
app.get('/api/health', (_, res) => {
  res.json({ status: 'EventEase backend running' });
});
// =======================================================
// PART 2/4 — EVENTS, CALENDAR, MAPS, QR TOKEN, REGISTRATION
// =======================================================

// -------------------- CREATE EVENT --------------------
app.post('/api/events', async (req, res) => {
  try {
    const {
      title,
      club,
      date,
      time,
      venue,
      category,
      description,
      posterUrl,
      organizerId,
      latitude,
      longitude
    } = req.body;

    if (!title || !club || !date || !time || !venue || !category || !organizerId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const checkinToken = uuidv4();

    const event = {
      title,
      club,
      date: admin.firestore.Timestamp.fromDate(new Date(date)),
      time,
      venue,
      category,
      description: description || '',
      posterUrl: posterUrl || '',
      organizerId,
      latitude: latitude || null,
      longitude: longitude || null,
      checkinToken,
      registeredUsers: [],
      bookmarkedBy: [],
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    };

    const ref = await db.collection('events').add(event);

    await logActivity('EVENT_CREATED', {
      eventId: ref.id,
      title,
      organizerId
    });

    res.status(201).json({
      message: 'Event created',
      eventId: ref.id,
      checkinToken
    });
  } catch (err) {
    serverError(res, err);
  }
});

// -------------------- GET ALL EVENTS --------------------
app.get('/api/events', async (req, res) => {
  try {
    const snapshot = await db.collection('events').orderBy('date', 'asc').get();

    const events = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      date: doc.data().date.toDate()
    }));

    res.json(events);
  } catch (err) {
    serverError(res, err);
  }
});

// -------------------- GET SINGLE EVENT --------------------
app.get('/api/events/:id', async (req, res) => {
  try {
    const doc = await db.collection('events').doc(req.params.id).get();

    if (!doc.exists) {
      return res.status(404).json({ error: 'Event not found' });
    }

    res.json({
      id: doc.id,
      ...doc.data(),
      date: doc.data().date.toDate()
    });
  } catch (err) {
    serverError(res, err);
  }
});

// -------------------- UPDATE EVENT --------------------
app.put('/api/events/:id', async (req, res) => {
  try {
    const update = req.body;

    if (update.date) {
      update.date = admin.firestore.Timestamp.fromDate(new Date(update.date));
    }

    await db.collection('events').doc(req.params.id).update(update);

    await logActivity('EVENT_UPDATED', { eventId: req.params.id });

    res.json({ message: 'Event updated' });
  } catch (err) {
    serverError(res, err);
  }
});

// -------------------- DELETE EVENT --------------------
app.delete('/api/events/:id', async (req, res) => {
  try {
    await db.collection('events').doc(req.params.id).delete();

    await logActivity('EVENT_DELETED', { eventId: req.params.id });

    res.json({ message: 'Event deleted' });
  } catch (err) {
    serverError(res, err);
  }
});

// -------------------- REGISTER FOR EVENT --------------------
app.post('/api/events/:id/register', async (req, res) => {
  try {
    const { userId } = req.body;
    const ref = db.collection('events').doc(req.params.id);
    const snap = await ref.get();

    if (!snap.exists) return res.status(404).json({ error: 'Event not found' });

    if (snap.data().registeredUsers.includes(userId)) {
      return res.status(400).json({ error: 'Already registered' });
    }

    await ref.update({
      registeredUsers: admin.firestore.FieldValue.arrayUnion(userId)
    });

    await logActivity('USER_REGISTERED_EVENT', {
      userId,
      eventId: req.params.id
    });

    res.json({ message: 'Registered successfully' });
  } catch (err) {
    serverError(res, err);
  }
});

// -------------------- BOOKMARK EVENT --------------------
app.post('/api/events/:id/bookmark', async (req, res) => {
  try {
    const { userId } = req.body;

    await db.collection('events').doc(req.params.id).update({
      bookmarkedBy: admin.firestore.FieldValue.arrayUnion(userId)
    });

    await logActivity('EVENT_BOOKMARKED', {
      userId,
      eventId: req.params.id
    });

    res.json({ message: 'Bookmarked' });
  } catch (err) {
    serverError(res, err);
  }
});

// -------------------- CALENDAR EVENTS --------------------
app.get('/api/events/calendar', async (req, res) => {
  try {
    const snapshot = await db.collection('events').get();
    const calendar = snapshot.docs.map(d => ({
      id: d.id,
      title: d.data().title,
      date: d.data().date.toDate()
    }));

    res.json(calendar);
  } catch (err) {
    serverError(res, err);
  }
});
// =======================================================
// PART 3/4 — QR CHECK-IN, COMMENTS, RATINGS, ACTIVITY FEED
// =======================================================

// -------------------- SECURE QR CHECK-IN --------------------
app.post('/api/events/:id/checkin', async (req, res) => {
  try {
    const { userId, token } = req.body;
    const eventId = req.params.id;

    if (!userId || !token) {
      return res.status(400).json({ error: 'Missing userId or token' });
    }

    const eventRef = db.collection('events').doc(eventId);
    const eventSnap = await eventRef.get();

    if (!eventSnap.exists) {
      return res.status(404).json({ error: 'Event not found' });
    }

    const event = eventSnap.data();

    if (event.checkinToken !== token) {
      return res.status(403).json({ error: 'Invalid QR token' });
    }

    if (!event.registeredUsers.includes(userId)) {
      return res.status(403).json({ error: 'User not registered for event' });
    }

    const checkinRef = db
      .collection('checkins')
      .doc(eventId)
      .collection('users')
      .doc(userId);

    const alreadyChecked = await checkinRef.get();
    if (alreadyChecked.exists) {
      return res.status(400).json({ error: 'Already checked in' });
    }

    await checkinRef.set({
      checkedInAt: admin.firestore.FieldValue.serverTimestamp()
    });

    await logActivity('USER_CHECKED_IN', { userId, eventId });

    res.json({ message: 'Check-in successful' });
  } catch (err) {
    serverError(res, err);
  }
});

// -------------------- COMMENTS --------------------
app.post('/api/events/:id/comments', async (req, res) => {
  try {
    const { userId, text } = req.body;

    if (!userId || !text) {
      return res.status(400).json({ error: 'Missing fields' });
    }

    await db.collection('comments').add({
      eventId: req.params.id,
      userId,
      text,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    await logActivity('COMMENT_ADDED', {
      eventId: req.params.id,
      userId
    });

    res.status(201).json({ message: 'Comment added' });
  } catch (err) {
    serverError(res, err);
  }
});

app.get('/api/events/:id/comments', async (req, res) => {
  try {
    const snap = await db
      .collection('comments')
      .where('eventId', '==', req.params.id)
      .orderBy('createdAt', 'desc')
      .get();

    const comments = snap.docs.map(d => ({
      id: d.id,
      ...d.data()
    }));

    res.json(comments);
  } catch (err) {
    serverError(res, err);
  }
});

// -------------------- RATINGS & REVIEWS --------------------
app.post('/api/events/:id/ratings', async (req, res) => {
  try {
    const { userId, rating, review } = req.body;

    if (!userId || !rating) {
      return res.status(400).json({ error: 'Missing rating or userId' });
    }

    await db.collection('ratings').add({
      eventId: req.params.id,
      userId,
      rating,
      review: review || '',
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    await logActivity('RATING_ADDED', {
      eventId: req.params.id,
      userId,
      rating
    });

    res.status(201).json({ message: 'Rating submitted' });
  } catch (err) {
    serverError(res, err);
  }
});

app.get('/api/events/:id/ratings', async (req, res) => {
  try {
    const snap = await db
      .collection('ratings')
      .where('eventId', '==', req.params.id)
      .get();

    let total = 0;
    const ratings = snap.docs.map(d => {
      total += d.data().rating;
      return d.data();
    });

    res.json({
      average: ratings.length ? total / ratings.length : 0,
      count: ratings.length,
      ratings
    });
  } catch (err) {
    serverError(res, err);
  }
});

// -------------------- ACTIVITY FEED --------------------
app.get('/api/activity-feed', async (req, res) => {
  try {
    const snap = await db
      .collection('activityFeed')
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get();

    const feed = snap.docs.map(d => ({
      id: d.id,
      ...d.data()
    }));

    res.json(feed);
  } catch (err) {
    serverError(res, err);
  }
});
// =======================================================
// PART 4/4 — RECOMMENDATIONS, USERS, ERRORS, SERVER START
// =======================================================

// -------------------- AI-STYLE EVENT RECOMMENDATIONS --------------------
app.get('/api/users/:userId/recommendations', async (req, res) => {
  try {
    const userId = req.params.userId;

    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = userDoc.data();
    const preferences = user.preferences || [];

    const eventsSnap = await db.collection('events').get();

    const scoredEvents = eventsSnap.docs.map(doc => {
      const data = doc.data();
      let score = 0;

      if (preferences.includes(data.category)) score += 2;
      if (preferences.includes(data.club)) score += 1;

      return {
        id: doc.id,
        score,
        ...data,
        date: data.date.toDate()
      };
    });

    scoredEvents.sort((a, b) => b.score - a.score);

    res.json(scoredEvents.slice(0, 5));
  } catch (err) {
    serverError(res, err);
  }
});

// -------------------- USER PROFILE --------------------
app.get('/api/users/:userId', async (req, res) => {
  try {
    const doc = await db.collection('users').doc(req.params.userId).get();
    if (!doc.exists) return res.status(404).json({ error: 'User not found' });

    res.json({ uid: doc.id, ...doc.data() });
  } catch (err) {
    serverError(res, err);
  }
});

app.put('/api/users/:userId', async (req, res) => {
  try {
    await db.collection('users').doc(req.params.userId).update(req.body);
    res.json({ message: 'User updated' });
  } catch (err) {
    serverError(res, err);
  }
});

// -------------------- 404 HANDLER --------------------
app.use('*', (_, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// -------------------- GLOBAL ERROR HANDLER --------------------
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Server error' });
});

// -------------------- SERVER START --------------------
app.listen(PORT, () => {
  console.log(`🚀 EventEase Backend running on port ${PORT}`);
});
