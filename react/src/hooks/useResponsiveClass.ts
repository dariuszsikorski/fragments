import { useState, useEffect } from 'react';

const useResponsiveClass = (breakpoint: number = 768) => {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkScreenSize = () => {
      const mobile = window.innerWidth < breakpoint;
      setIsMobile(mobile);
      
      // Apply classes to html element
      const htmlElement = document.documentElement;
      if (mobile) {
        htmlElement.classList.add('is-mobile');
        htmlElement.classList.remove('is-desktop');
      } else {
        htmlElement.classList.add('is-desktop');
        htmlElement.classList.remove('is-mobile');
      }
    };

    // Initial check
    checkScreenSize();

    // Listen for resize events
    window.addEventListener('resize', checkScreenSize);

    return () => {
      window.removeEventListener('resize', checkScreenSize);
    };
  }, [breakpoint]);

  return isMobile;
};

export default useResponsiveClass;