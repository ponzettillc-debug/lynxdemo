import Image from "next/image";
import Link from "next/link";

type AppLogoProps = {
  href?: string;
  width?: number;
  height?: number;
  priority?: boolean;
};

export default function AppLogo({
  href = "/",
  width = 220,
  height = 90,
  priority = false,
}: AppLogoProps) {
  const logo = (
    <Image
      src="/4play-logo.png"
      alt="4Play Golf"
      width={width}
      height={height}
      priority={priority}
      style={{
        width: "auto",
        height: "auto",
        maxWidth: "100%",
        display: "block",
      }}
    />
  );

  return href ? <Link href={href}>{logo}</Link> : logo;
}