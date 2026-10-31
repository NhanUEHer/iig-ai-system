const repository = require('./jobListRepository');
const { validate } = require('./jobListValidator');
class JobListService {
  constructor(jobRepository = repository) { this.repository = jobRepository; }
  list(query) { return this.repository.list(validate(query)); }
  facets() { return this.repository.facets(); }
  async export(query) { return this.repository.list(validate(query, { exportMode: true })); }
}
module.exports = new JobListService();
module.exports.JobListService = JobListService;
