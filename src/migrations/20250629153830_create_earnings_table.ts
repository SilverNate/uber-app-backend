import type { Knex } from "knex";


export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable('earnings', (table) => {
    table.increments('id').primary();
    table.uuid('driver_id').notNullable();
    table.integer('ride_id').notNullable();
    table.float('amount').notNullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });
}


export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTable('earnings');

}

