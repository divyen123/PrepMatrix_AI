import { useEffect } from "react";
import { getFloatingOverlayReservedHeight } from "../utils/floatingOverlayStack";

export default function useFloatingOverlayStackSlot(ref, property, active = true) {
  useEffect(() => {
    if (!active || typeof document === "undefined") return undefined;

    const element = ref.current;
    if (!element) return undefined;

    const root = document.documentElement;
    const updateReservation = () => {
      root.style.setProperty(
        property,
        getFloatingOverlayReservedHeight(element.getBoundingClientRect().height),
      );
    };

    updateReservation();

    if (typeof ResizeObserver === "function") {
      const observer = new ResizeObserver(updateReservation);
      observer.observe(element);
      return () => {
        observer.disconnect();
        root.style.removeProperty(property);
      };
    }

    window.addEventListener("resize", updateReservation);
    return () => {
      window.removeEventListener("resize", updateReservation);
      root.style.removeProperty(property);
    };
  }, [active, property, ref]);
}
