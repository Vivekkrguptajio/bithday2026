import './globals.css';

export const metadata = {
  title: 'Manisha ki Birthday Party 🎉',
  description: 'Ek 3D birthday party room',
};

export default function RootLayout({ children }) {
  return (
    <html lang="hi">
      <body>{children}</body>
    </html>
  );
}
