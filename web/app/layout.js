import "./globals.css";

export const metadata = {
  title: "LILA BLACK — Player Journey Visualizer",
  description: "Level Design tool for visualizing player movement, combat, and behavior across LILA BLACK maps.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
