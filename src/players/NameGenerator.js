export const NameGenerator = {
    firstNames: [
        'Adam', 'Adrian', 'Ahmed', 'Amir', 'Arjun',
        'Arthur', 'Benjamin', 'Carlos', 'Connor', 'Dante',
        'David', 'Diego', 'Dimitri', 'Elias', 'Emil',
        'Ethan', 'Felix', 'Finn', 'Gabriel', 'Haruto',
        'Hugo', 'Ibrahim', 'Isaac', 'Ivan', 'Jack',
        'Jamal', 'Javier', 'Jin', 'Jonas', 'Kaito',
        'Kenji', 'Kofi', 'Leo', 'Liam', 'Lucas',
        'Malik', 'Marco', 'Mateo', 'Miguel', 'Milo',
        'Junho', 'Niko', 'Omar', 'Oscar', 'Pavel',
        'Rafael', 'Ravi', 'Reuben', 'Samuel', 'Santiago',
        'Sebastian', 'Sergio', 'Sven', 'Tariq', 'Theo',
        'Tomas', 'Victor', 'Zhihao', 'Youssef', 'Zane'
    ],

    lastNames: [
        'Okafor', 'Fernandez', 'Nguyen', 'Kowalski', 'Kim',
        'Patel', 'Dubois', 'Abdullah', 'Takahashi', 'Singh',
        'Almeida', 'Nakamura', 'Mensah', 'Yilmaz', 'OSullivan',
        'Chowdhury', 'Petrov', 'Garcia', 'Zhou', 'Bakker',
        'Moreno', 'Da Silva', 'Toure', 'Leclerc', 'Rahman',
        'Rossi', 'Mwangi', 'Chen', 'Ahmadi', 'Bautista',
        'Khan', 'Dlamini', 'Lopez', 'Muller', 'Nasr',
        'El-Sayed', 'Ivanov', 'Hashimoto', 'Dubey', 'Almasi'
    ],

    generate() {
        const first = Phaser.Math.RND.pick(this.firstNames);
        const last = Phaser.Math.RND.pick(this.lastNames);
        return `${first} ${last}`;
    }
};
