import { M3uChannel } from './types';

/**
 * Parses M3U or M3U8 string content and returns an array of channels.
 */
export const parseM3u = (text: string): M3uChannel[] => {
  const lines = text.split(/\r?\n/);
  const channels: M3uChannel[] = [];
  let currentInfo: { name: string; logo?: string; group?: string } | null = null;
  let idCounter = 1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    if (line.startsWith('#EXTINF:')) {
      // Look for tvg-logo="..."
      const logoMatch = line.match(/tvg-logo="([^"]+)"/i);
      // Look for group-title="..."
      const groupMatch = line.match(/group-title="([^"]+)"/i);
      
      // Look for tvg-name="..." as a potential fallback name
      const tvgNameMatch = line.match(/tvg-name="([^"]+)"/i);

      // Extract name (usually after the last comma ,)
      const commaIndex = line.lastIndexOf(',');
      let name = '';
      if (commaIndex !== -1) {
        name = line.substring(commaIndex + 1).trim();
      } else if (tvgNameMatch && tvgNameMatch[1]) {
        name = tvgNameMatch[1].trim();
      }

      // If name is still empty or looks like a duration, give it a default
      if (!name || name === '-1' || name === '0') {
        name = tvgNameMatch && tvgNameMatch[1] ? tvgNameMatch[1] : `قناة ${idCounter}`;
      }

      currentInfo = {
        name,
        logo: logoMatch ? logoMatch[1].trim() : undefined,
        group: groupMatch ? groupMatch[1].trim() : undefined,
      };
    } else if (line.startsWith('#')) {
      // Ignore other tag types (e.g. #EXTM3U, #EXTVLCOPT, etc.)
    } else {
      // This is a URL
      const url = line;
      // Basic validation that looks like a path or url
      if (url.startsWith('http') || url.startsWith('rtmp') || url.includes('/')) {
        channels.push({
          id: `channel-${idCounter++}`,
          name: currentInfo?.name || `قناة ${idCounter}`,
          url,
          logo: currentInfo?.logo,
          group: currentInfo?.group || 'غير مصنف', // Uncategorized
        });
      }
      currentInfo = null; // Reset for next entries
    }
  }

  return channels;
};

/**
 * Generates sample channels in M3U format to help users who don't have a playlist yet.
 */
export const getSampleArabicChannels = (): M3uChannel[] => {
  return [
    {
      id: "sample-1",
      name: "القناة الإخبارية المنوعة 1",
      url: "https://af.ayassport.ir/hls2/bein1.m3u8",
      logo: "https://upload.wikimedia.org/wikipedia/commons/c/c2/BeIN_Sports_logo.svg",
      group: "عامة (General)"
    },
    {
      id: "sample-2",
      name: "الجزيرة الإخبارية",
      url: "https://live-aljazeera.akamaized.net/aljazeera/ara/core.m3u8",
      logo: "https://upload.wikimedia.org/wikipedia/commons/e/e6/Al_Jazeera_Logo.svg",
      group: "أخبار (News)"
    },
    {
      id: "sample-3",
      name: "سكاي نيوز عربية",
      url: "https://skynewsarabia-live.akamaized.net/hls/live/2004245/snabusiness/master.m3u8",
      logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e7/Sky_News_Arabia_Logo.svg/1200px-Sky_News_Arabia_Logo.svg.png",
      group: "أخبار (News)"
    },
    {
      id: "sample-4",
      name: "تلفزيون قطر HD",
      url: "https://qtvm.gcdn.co/live/master.m3u8",
      logo: "https://upload.wikimedia.org/wikipedia/commons/f/fb/Qatar_Television_Logo_2023.png",
      group: "عامة (General)"
    },
    {
      id: "sample-5",
      name: "القناة الثقافية الوثائقية",
      url: "https://alkass.gcdn.co/alkass-one/alkass-one.m3u8",
      logo: "https://upload.wikimedia.org/wikipedia/ar/0/02/Alkass_Digital_Logo.svg",
      group: "ثقافة (Culture)"
    }
  ];
};
