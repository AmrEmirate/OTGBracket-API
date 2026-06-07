import express from 'express';
import cors from 'cors';
import mainRouter from './routers';
import { errorHandler } from './middleware/errorHandler';

const app = express();

app.use(cors());
app.use(express.json());

// API Routes
app.use('/api', mainRouter);

// Serve uploads folder
app.use('/uploads', express.static('uploads'));

// Global Error Handler
app.use(errorHandler);

export default app;
