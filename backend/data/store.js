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
    const cleanData = {};
    if (data && typeof data === 'object') {
      for (const [key, val] of Object.entries(data)) {
        if (val !== undefined) {
          cleanData[key] = val;
        }
      }
    }
    this.db[table][index] = { ...this.db[table][index], ...cleanData };
    return this.db[table][index];
  }
  
  remove(table, id) {
    if (!this.db[table]) return false;
    const initialLength = this.db[table].length;
    this.db[table] = this.db[table].filter(item => item.id !== id);
    return this.db[table].length < initialLength;
  }

  removeWhere(table, predicate) {
    if (!this.db[table]) return 0;
    const initialLength = this.db[table].length;
    this.db[table] = this.db[table].filter(item => !predicate(item));
    return initialLength - this.db[table].length;
  }
  
  find(table, predicate) {
    return this.all(table).find(predicate);
  }
  
  filter(table, predicate) {
    return this.all(table).filter(predicate);
  }
}

module.exports = new Store();
