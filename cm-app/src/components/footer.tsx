"use client";

export default function Footer() {
  return (
    <div className="flex flex-col items-center justify-center h-20 w-full bg-fabric-bg-light">
      &copy; FABRIC {new Date().getFullYear()}
    </div>
  );
}
