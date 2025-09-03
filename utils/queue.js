let last = Promise.resolve();
function enqueue(taskFn) {
  const job = last.then(taskFn).catch(() => {});
  last = job.catch(() => {});
  return job;
}
module.exports = { enqueue };