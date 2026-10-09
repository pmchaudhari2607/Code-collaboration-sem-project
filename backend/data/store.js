const seedData = require('./seed');

class Store {
  constructor() {
    this.db = JSON.parse(JSON.stringify(seedData));
  }
  
  reset() {
    this.db = JSON.parse(JSON.stringify(seedData));
  }
  
  all(table) {
    return this.db[table] || [];
  }
  
  findById(table, id) {
    return this.all(table).find(item => item.id === id);
  }
  
  insert(table, data) {
    if (!this.db[table]) this.db[table] = [];
    this.db[table].push(data);
    return data;
  }
  
  update(table, id, data) {
    const index = this.all(table).findIndex(item => item.id === id);
    if (index === -1) return null;
    this.db[table][index] = { ...this.db[table][index], ...data };
    return this.db[table][index];
  }
  
  remove(table, id) {
    if (!this.db[table]) return false;
    const initialLength = this.db[table].length;
    this.db[table] = this.db[table].filter(item => item.id !== id);
    return this.db[table].length < initialLength;
  }
  
  find(table, predicate) {
    return this.all(table).find(predicate);
  }
  
  filter(table, predicate) {
    return this.all(table).filter(predicate);
  }
}

module.exports = new Store();
