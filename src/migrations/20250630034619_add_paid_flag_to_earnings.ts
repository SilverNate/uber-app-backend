import type { Knex } from "knex";


export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable('earnings', (table) => {
    table.boolean('paid').defaultTo(false);
    table.timestamp('paid_at').nullable();
  });
}


export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable('earnings', (table) => {
    table.dropColumn('paid');
    table.dropColumn('paid_at');
  });
}

