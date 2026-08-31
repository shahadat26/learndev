/**
 * Roles are duplicated here on purpose.
 *
 * product-service has no user table and no Prisma `Role` enum: it only reads the
 * `role` claim out of an access token signed by account-service. Keeping a local
 * copy of the enum is the price of not sharing a database between services -
 * the two services agree on the wire format (the JWT), not on a schema.
 */
export enum Role {
  USER = 'USER',
  ADMIN = 'ADMIN',
}
