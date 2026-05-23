import Head from "next/head";
import "../styles/colors_and_type.css";
import "../styles/app.css";
import "../styles/upload.css";

export default function App({ Component, pageProps }) {
  return (
    <>
      <Head>
        <title>Opptra Pricing Copilot</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, minimum-scale=1"/>
        <meta name="description" content="AI-powered pricing triage for Buy Box recovery, opportunity capture, and approval workflow."/>
        <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 200'%3E%3Crect width='200' height='200' rx='32' fill='%232e31be'/%3E%3Ctext x='100' y='128' font-family='system-ui' font-size='100' font-weight='700' text-anchor='middle' fill='%23fff'%3EO%3C/text%3E%3Ccircle cx='155' cy='60' r='14' fill='%23ec4899'/%3E%3C/svg%3E"/>
      </Head>
      <Component {...pageProps} />
    </>
  );
}
