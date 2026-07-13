// A deliberately non-responsive child used to verify the production timeout boundary.
process.once("message", () => {
  setInterval(() => {}, 1000);
});
