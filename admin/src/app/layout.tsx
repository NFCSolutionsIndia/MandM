import type { Metadata } from 'next';
import { Figtree, Geist_Mono } from 'next/font/google';
import './globals.css';

/**
 * Figtree for everything, Geist Mono for the few monospaced labels.
 *
 * The comp's display face is a warm geometric sans; Figtree is the closest
 * match available through `next/font`. If the real brand face is something
 * else, swapping it is this import and the `--font-figtree` token in
 * `globals.css` — nothing in the markup names a font.
 */
const figtree = Figtree({
  variable: '--font-figtree',
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'M&M Admin',
  description: 'Moments & Memories — operations console',

  /**
   * The console is never meant to be found. It is reachable only by people
   * who were told where it is.
   */
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang="en"
      className={`${figtree.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="bg-mm-black text-mm-on-dark min-h-full">{children}</body>
    </html>
  );
}
