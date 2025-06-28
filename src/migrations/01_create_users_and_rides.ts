import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('users', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('name').notNullable();
    table.string('phone').notNullable().unique();
    table.string('password').notNullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('rides', (table) => {
    table.increments('id').primary();
    table.uuid('rider_id').notNullable();
    table.float('origin_lat').notNullable();
    table.float('origin_lng').notNullable();
    table.float('dest_lat').notNullable();
    table.float('dest_lng').notNullable();
    table.string('status').defaultTo('requested');
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('rides');
  await knex.schema.dropTableIfExists('users');
}
