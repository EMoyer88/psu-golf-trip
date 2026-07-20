import './globals.css';

export const metadata = {
  title: '9th Annual PSU Golf Trip',
  description: 'Scoring, chat, and costs for the trip',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
