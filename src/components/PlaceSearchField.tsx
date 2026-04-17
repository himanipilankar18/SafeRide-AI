import { useEffect, useState } from "react";
import { LocateFixed, MapPin, Search } from "lucide-react";
import { PlaceSuggestion, searchNearbyLandmarks, searchPlaces } from "@/lib/placeSearch";
import { LatLng } from "@/lib/navigationSafety";

const RECENT_SEARCHES_KEY = "saferide_recent_place_searches";
const MAX_RECENTS = 6;

interface PlaceSearchFieldProps {
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  onSelectPlace?: (place: PlaceSuggestion) => void;
  helperText?: string;
  currentLocation?: LatLng | null;
  showCurrentLocationOption?: boolean;
  showLabel?: boolean;
}

const PlaceSearchField = ({
  label,
  placeholder,
  value,
  onChange,
  onSelectPlace,
  helperText,
  currentLocation,
  showCurrentLocationOption = false,
  showLabel = true,
}: PlaceSearchFieldProps) => {
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [nearbyLandmarks, setNearbyLandmarks] = useState<PlaceSuggestion[]>([]);
  const [recentSearches, setRecentSearches] = useState<PlaceSuggestion[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(RECENT_SEARCHES_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as PlaceSuggestion[];
        if (Array.isArray(parsed)) {
          setRecentSearches(parsed.slice(0, MAX_RECENTS));
        }
      }
    } catch {
      setRecentSearches([]);
    }
  }, []);

  const saveRecentSearch = (place: PlaceSuggestion) => {
    setRecentSearches((current) => {
      const next = [place, ...current.filter((item) => item.label.toLowerCase() !== place.label.toLowerCase())].slice(
        0,
        MAX_RECENTS,
      );

      try {
        window.localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(next));
      } catch {
        // ignore storage failures in private browsing or restricted contexts
      }

      return next;
    });
  };

  const mergeSuggestions = (remote: PlaceSuggestion[], recents: PlaceSuggestion[]) => {
    const seen = new Set<string>();
    return [...recents, ...remote].filter((place) => {
      const key = `${place.label.toLowerCase()}-${place.lat}-${place.lng}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  };

  useEffect(() => {
    let cancelled = false;

    const timer = window.setTimeout(async () => {
      if (value.trim().length < 3) {
        setSuggestions(recentSearches);
        return;
      }

      const results = await searchPlaces(value, 5);
      if (!cancelled) {
        const lowerQuery = value.trim().toLowerCase();
        const matchingRecents = recentSearches.filter((place) => place.label.toLowerCase().includes(lowerQuery));
        setSuggestions(mergeSuggestions(results, matchingRecents));
      }
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [value, recentSearches]);

  useEffect(() => {
    let cancelled = false;

    if (!showCurrentLocationOption || !currentLocation) {
      setNearbyLandmarks([]);
      return;
    }

    searchNearbyLandmarks(currentLocation, 5).then((results) => {
      if (!cancelled) {
        setNearbyLandmarks(results);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [currentLocation, showCurrentLocationOption]);

  const currentLocationSuggestion =
    showCurrentLocationOption && currentLocation
      ? {
          lat: currentLocation.lat,
          lng: currentLocation.lng,
          label: "Current location",
        }
      : null;

  const shouldShowCurrentLocation = Boolean(currentLocationSuggestion && value.trim().length < 3);
  const nearbySuggestions =
    shouldShowCurrentLocation && nearbyLandmarks.length > 0
      ? mergeSuggestions(nearbyLandmarks, []).filter(
          (nearby) =>
            !suggestions.some(
              (suggestion) =>
                suggestion.label.toLowerCase() === nearby.label.toLowerCase() &&
                suggestion.lat === nearby.lat &&
                suggestion.lng === nearby.lng,
            ),
        )
      : [];
  const hasDropdownContent = shouldShowCurrentLocation || nearbySuggestions.length > 0 || suggestions.length > 0;

  const selectPlace = (place: PlaceSuggestion, shouldSave = true) => {
    onChange(place.label);
    onSelectPlace?.(place);
    if (shouldSave) {
      saveRecentSearch(place);
    }
    setSuggestions([]);
    setOpen(false);
  };

  return (
    <div className="space-y-2">
      {showLabel && <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{label}</p>}
      <div className="relative">
        <div className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3">
          <Search size={18} className="text-muted-foreground" />
          <input
            value={value}
            onChange={(event) => {
              onChange(event.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => window.setTimeout(() => setOpen(false), 150)}
            placeholder={placeholder}
            className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
            autoComplete="off"
          />
        </div>

        {open && hasDropdownContent && (
          <div className="absolute z-20 mt-2 w-full overflow-hidden rounded-2xl border border-border bg-card shadow-xl">
            {shouldShowCurrentLocation && currentLocationSuggestion && (
              <button
                type="button"
                className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-accent"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => selectPlace(currentLocationSuggestion, false)}
              >
                <LocateFixed size={16} className="mt-0.5 shrink-0 text-primary" />
                <span>
                  <span className="block text-sm font-semibold text-foreground">Current location</span>
                  <span className="block text-[11px] text-muted-foreground">
                    {currentLocationSuggestion.lat.toFixed(5)}, {currentLocationSuggestion.lng.toFixed(5)}
                  </span>
                </span>
              </button>
            )}

            {shouldShowCurrentLocation && nearbyLandmarks.length > 0 && (
              <div className="px-4 pt-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Nearby landmarks
              </div>
            )}
            {nearbySuggestions.map((suggestion) => (
              <button
                key={`nearby-${suggestion.label}-${suggestion.lat}-${suggestion.lng}`}
                type="button"
                className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-accent"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => selectPlace(suggestion)}
              >
                <MapPin size={16} className="mt-0.5 shrink-0 text-primary" />
                <span className="text-sm text-foreground">{suggestion.label}</span>
              </button>
            ))}

            {value.trim().length < 3 && recentSearches.length > 0 && (
              <div className="px-4 pt-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Recent searches
              </div>
            )}
            {suggestions.map((suggestion) => (
              <button
                key={`${suggestion.label}-${suggestion.lat}-${suggestion.lng}`}
                type="button"
                className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-accent"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => selectPlace(suggestion)}
              >
                <MapPin size={16} className="mt-0.5 shrink-0 text-primary" />
                <span className="text-sm text-foreground">{suggestion.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      {helperText && <p className="text-[11px] text-muted-foreground">{helperText}</p>}
    </div>
  );
};

export default PlaceSearchField;
