import { useState, useEffect } from 'react';

export const useDeviceType = () => {
  const [isMobile, setIsMobile] = useState(false);
  const [isTablet, setIsTablet] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const checkDevice = () => {
      const width = window.innerWidth;
      const userAgent = navigator.userAgent.toLowerCase();
      
      // Check if it's a mobile device based on screen width and user agent
      const mobileWidth = width < 768;
      const mobileAgent = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent);
      
      setIsMobile(mobileWidth || mobileAgent);
      setIsTablet(width >= 768 && width < 1024);
      setIsDesktop(width >= 1024);
    };

    checkDevice();
    window.addEventListener('resize', checkDevice);
    
    return () => window.removeEventListener('resize', checkDevice);
  }, []);

  return { isMobile, isTablet, isDesktop };
};

export default useDeviceType;
