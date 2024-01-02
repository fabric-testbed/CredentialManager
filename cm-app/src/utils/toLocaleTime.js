export default function toLocaleTime(UTCtime) {
  const date = new Date(UTCtime.replace(' ','T'));
  // The toLocaleString() returns a Date object as a string, using locale settings.
  // The default language depends on the locale setup on your computer.
  return date.toLocaleString();
}
