import type { Knex } from "knex";


export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable('rides', (table) => {
    table.integer('rating').nullable();
    table.text('comment').nullable();
  });
}


export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable('rides', (table) => {
    table.dropColumn('rating');
    table.dropColumn('comment');
  });
}

