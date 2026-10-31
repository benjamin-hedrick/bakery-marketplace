import { Head, Html, Main, NextScript } from 'next/document';

/** The page shell: the document language, which assistive technology needs to pronounce the text (WCAG 3.1.1). */
export default function Document() {
  return (
    <Html lang="en">
      <Head />
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
