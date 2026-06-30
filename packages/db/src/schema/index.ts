// The full Xenia schema, one file per bounded context. drizzle-kit reads this
// barrel; the app imports tables from here too.
export * from './identity';
export * from './property';
export * from './guest';
export * from './booking';
export * from './calendar';
export * from './messaging';
export * from './tasks';
export * from './access';
export * from './maintenance';
export * from './notifications';
export * from './ai';
export * from './workflow';
export * from './pricing';
export * from './billing';
export * from './audit';
