/*
  Mode icons for the transit map: bus, light rail or streetcar, train, ferry. Simple filled
  shapes on a 24 x 24 grid, filled with the even-odd rule so windows and wheels are holes.
  Used as inline SVG in the page (filters, popups) and drawn onto canvas for map markers.
*/
export type IconMode = 'bus' | 'tram' | 'rail' | 'ferry';

export const ICONS: Record<IconMode, string> = {
  bus: 'M7 2.5h10a3.5 3.5 0 0 1 3.5 3.5v10.5a2 2 0 0 1-1 1.73V20.5a1 1 0 0 1-1 1h-1.5a1 1 0 0 1-1-1v-1.5h-8v1.5a1 1 0 0 1-1 1H5.5a1 1 0 0 1-1-1v-2.27a2 2 0 0 1-1-1.73V6A3.5 3.5 0 0 1 7 2.5ZM6 7v4.5h12V7H6Zm2 6.75a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm8 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3ZM9 4.25v1.25h6V4.25H9Z',
  tram: 'M8.5 1.5h7V3h-2.6l1.2 2.5H16A3.5 3.5 0 0 1 19.5 9v8a3 3 0 0 1-2.1 2.86l1.6 2.64h-2.4l-1.3-2.25H8.7L7.4 22.5H5l1.6-2.64A3 3 0 0 1 4.5 17V9A3.5 3.5 0 0 1 8 5.5h1.9L11.1 3H8.5V1.5ZM7 8.5v4.5h10V8.5H7Zm1.75 6.25a1.25 1.25 0 1 0 0 2.5 1.25 1.25 0 0 0 0-2.5Zm6.5 0a1.25 1.25 0 1 0 0 2.5 1.25 1.25 0 0 0 0-2.5Z',
  rail: 'M12 1.5c4.6 0 7.5 1.2 7.5 4.5v10.5a3 3 0 0 1-2.2 2.9l1.8 3.1h-2.4l-1.6-2.75H8.9L7.3 22.5H4.9l1.8-3.1a3 3 0 0 1-2.2-2.9V6c0-3.3 2.9-4.5 7.5-4.5ZM7 6.5V11h4.25V6.5H7Zm5.75 0V11H17V6.5h-4.25ZM8.25 13.75a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm7.5 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z',
  ferry: 'M10.25 1.5h3.5v2.25h3.5v5.1l2.9 1a1 1 0 0 1 .62 1.27L18.9 16.5H5.1l-1.87-5.38a1 1 0 0 1 .62-1.27l2.9-1v-5.1h3.5V1.5ZM9 6v2.1l3-1.03 3 1.03V6H9ZM2 19.25c1.25 0 1.9-.9 3.33-.9s2.08.9 3.34.9 1.9-.9 3.33-.9 2.08.9 3.33.9 1.9-.9 3.34-.9 2.08.9 3.33.9v2.25c-1.25 0-1.9-.9-3.33-.9s-2.08.9-3.34.9-1.9-.9-3.33-.9-2.08.9-3.33.9-1.9-.9-3.34-.9-2.08.9-3.33.9v-2.25Z',
};

export const MODE_LABELS: Record<IconMode, string> = {
  bus: 'Bus',
  tram: 'Light rail or streetcar',
  rail: 'Train',
  ferry: 'Ferry',
};
