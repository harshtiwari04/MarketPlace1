import mongoose from 'mongoose';
import { env, isProd } from './env';
import { logger } from '../utils/logger';

let listenersAttached = false;

/**
 * Connection pooling + timeouts tuned for a web API under load:
 *  - maxPoolSize/minPoolSize: bounded pool per process (Atlas M0 caps at 500 connections total —
 *    keep maxPoolSize × instance count comfortably below that).
 *  - serverSelectionTimeoutMS: fail a request in 10s instead of hanging when the cluster is unreachable.
 *  - socketTimeoutMS: kill sockets idle > 45s so a stuck query can't pin a pool slot forever.
 *  - maxIdleTimeMS: return idle connections to the OS between traffic bursts.
 *  - retryWrites/retryReads: transparent single retry on transient network blips (Atlas default, made explicit).
 *  - compressors: lower egress bandwidth between Render and Atlas.
 */
export const connectDB = async (): Promise<void> => {
  mongoose.set('strictQuery', true);
  // Don't queue operations while disconnected — fail fast so the caller gets a 503 and the
  // load balancer stops routing to this instance, instead of piling up requests in memory.
  mongoose.set('bufferCommands', false);

  if (!listenersAttached) {
    listenersAttached = true;
    mongoose.connection.on('connected', () => logger.info('MongoDB connected'));
    mongoose.connection.on('reconnected', () => logger.info('MongoDB reconnected'));
    mongoose.connection.on('error', (err) => logger.error('MongoDB connection error', { err: String(err) }));
    mongoose.connection.on('disconnected', () => logger.warn('MongoDB disconnected'));
  }

  await mongoose.connect(env.MONGO_URI, {
    // autoIndex builds indexes at boot; fine for a single-digit-collection app. In production this
    // still runs (indexes are idempotent) so a fresh cluster is correct on first deploy.
    autoIndex: true,
    maxPoolSize: env.MONGO_MAX_POOL_SIZE,
    minPoolSize: env.MONGO_MIN_POOL_SIZE,
    serverSelectionTimeoutMS: 10_000,
    connectTimeoutMS: 10_000,
    socketTimeoutMS: 45_000,
    maxIdleTimeMS: 60_000,
    heartbeatFrequencyMS: 10_000,
    retryWrites: true,
    retryReads: true,
    compressors: ['zstd', 'snappy', 'zlib'],
    appName: 'marketplace-api',
  });

  await assertReplicaSet();
};

/**
 * Checkout uses multi-document transactions, which a standalone mongod silently cannot run — the
 * failure only surfaces at the first payment. Detect it at boot instead.
 */
const assertReplicaSet = async (): Promise<void> => {
  try {
    const hello = (await mongoose.connection.db!.admin().command({ hello: 1 })) as { setName?: string; msg?: string };
    if (!hello.setName && hello.msg !== 'isdbgrid') {
      const msg =
        'MongoDB is a standalone server, not a replica set. Checkout transactions WILL fail. ' +
        'Use `docker compose up mongo`, MongoDB Atlas, or start mongod with --replSet and run rs.initiate().';
      if (isProd) throw new Error(msg);
      logger.error(msg);
    }
  } catch (err) {
    if (isProd) throw err;
    logger.warn('Could not verify replica set status', { err: String(err) });
  }
};

/** 1 = connected. Used by /health so the load balancer stops routing to an instance that lost its DB. */
export const isDbReady = (): boolean => mongoose.connection.readyState === 1;

export const disconnectDB = async (): Promise<void> => {
  await mongoose.connection.close();
};
