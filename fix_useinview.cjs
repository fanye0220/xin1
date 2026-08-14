const fs = require('fs');

const code = `import { useEffect, useState } from 'react';

type Callback = (isIntersecting: boolean) => void;
let observer: IntersectionObserver | null = null;
const callbacks = new WeakMap<Element, Callback>();

function getObserver() {
  if (!observer) {
    observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const callback = callbacks.get(entry.target);
          if (callback) {
            callback(entry.isIntersecting);
          }
        });
      },
      { rootMargin: '400px', threshold: 0 }
    );
  }
  return observer;
}

export function useInView(ref: React.RefObject<Element | null>) {
  const [isInView, setIsInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    callbacks.set(el, setIsInView);
    getObserver().observe(el);

    return () => {
      callbacks.delete(el);
      if (observer) {
        observer.unobserve(el);
      }
    };
  }, [ref]);

  return isInView;
}
`;
fs.writeFileSync('src/lib/useInView.ts', code);
console.log('Fixed useInView!');
