"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.seed = seed;
async function seed(knex) {
    await knex('rides').del();
    await knex('users').del();
    const [user1] = await knex('users')
        .insert([
        {
            id: knex.raw('gen_random_uuid()'),
            name: 'Alice',
            phone: '081234567890',
            password: '$2b$10$uA0kZ.HmJGq9IVlmvVJcMeDEq0mWrQ6D6KxVQPhL6tJ8pFbLrXwAG', // bcrypt for 'password'
        },
    ])
        .returning('*');
    await knex('rides').insert([
        {
            rider_id: user1.id,
            origin_lat: -6.2,
            origin_lng: 106.8,
            dest_lat: -6.3,
            dest_lng: 106.7,
            status: 'requested',
        },
    ]);
}
