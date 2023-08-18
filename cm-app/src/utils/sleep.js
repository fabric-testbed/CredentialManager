export default function sleep(time) {
  // in milleseconds
  return new Promise((resolve) => setTimeout(resolve, time));
}
