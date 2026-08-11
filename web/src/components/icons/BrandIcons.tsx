import { siFacebook, siInstagram, siEtsy, siX, siYoutube } from "simple-icons";

/** Props shared by every brand icon component: an optional `className` for sizing/color. */
export interface IBrandIconProps {
  className?: string;
}

/**
 * For the social media and brand icons, we define custom SVG components to avoid adding a full icon library dependency.
 * Each component accepts an optional `className` prop for styling.
 * This approach keeps our bundle size smaller while still allowing us to easily include the necessary icons for our social media links.
 * If we wanted to add more icons in the future, we could simply create additional components following the same pattern.
 * Sources for SVG paths:
 * https://github.com/simple-icons/simple-icons.git
 * https://simpleicons.org/
 */

export const SiFacebook = ({ className }: IBrandIconProps) => (
  <svg
    className={className}
    aria-hidden="true"
    viewBox="0 0 24 24"
    fill="currentColor"
    xmlns="http://www.w3.org/2000/svg"
  >
    {siFacebook.title && <title>{siFacebook.title}</title>}
    {siFacebook.path && <path d={siFacebook.path} />}
  </svg>
);

export const SiInstagram = ({ className }: IBrandIconProps) => (
  <svg
    className={className}
    aria-hidden="true"
    viewBox="0 0 24 24"
    fill="currentColor"
    xmlns="http://www.w3.org/2000/svg"
  >
    {siInstagram.title && <title>{siInstagram.title}</title>}
    {siInstagram.path && <path d={siInstagram.path} />}
  </svg>
);

export const SiEtsy = ({ className }: IBrandIconProps) => (
  <svg
    className={className}
    aria-hidden="true"
    viewBox="0 0 24 24"
    fill="currentColor"
    xmlns="http://www.w3.org/2000/svg"
  >
    {siEtsy.title && <title>{siEtsy.title}</title>}
    {siEtsy.path && <path d={siEtsy.path} />}
  </svg>
);

export const SiTwitter = ({ className }: IBrandIconProps) => (
  <svg
    className={className}
    aria-hidden="true"
    viewBox="0 0 24 24"
    fill="currentColor"
    xmlns="http://www.w3.org/2000/svg"
  >
    {siX.title && <title>{siX.title}</title>}
    {siX.path && <path d={siX.path} />}
  </svg>
);

export const SiYouTube = ({ className }: IBrandIconProps) => (
  <svg
    className={className}
    aria-hidden="true"
    viewBox="0 0 24 24"
    fill="currentColor"
    xmlns="http://www.w3.org/2000/svg"
  >
    {siYoutube.title && <title>{siYoutube.title}</title>}
    {siYoutube.path && <path d={siYoutube.path} />}
  </svg>
);
