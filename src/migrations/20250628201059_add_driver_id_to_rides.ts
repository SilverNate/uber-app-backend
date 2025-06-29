import type { Knex } from "knex";


export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable('rides', (table) => {
    table.uuid('driver_id').nullable();
  });
}


export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable('rides', (table) => {
    table.dropColumn('driver_id');
  });
}

