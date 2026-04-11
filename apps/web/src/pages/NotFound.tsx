import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <main className="flex h-screen w-screen flex-col items-center justify-center bg-[#0a0a12] text-[#c8cad0]">
      <h1 className="text-3xl font-semibold">404</h1>
      <p className="mt-2 text-sm text-[#888]">Page not found.</p>
      <Link
        to="/dashboard"
        className="mt-4 rounded-md border border-[#2a2a3a] bg-[#1a1a26] px-4 py-2 text-sm hover:border-[#7c6aed]"
      >
        Back home
      </Link>
    </main>
  );
}
