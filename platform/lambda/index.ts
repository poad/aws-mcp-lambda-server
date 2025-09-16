import { handle } from 'hono/aws-lambda';
import { app } from './app';

// Lambda handler
export const handler = handle(app);
