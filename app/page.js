'use client';

import dynamic from 'next/dynamic';

// WebGL + sockets only make sense in the browser.
const Party = dynamic(() => import('../components/Party'), { ssr: false });

export default function Page() {
  return <Party />;
}
