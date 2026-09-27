export const INITIAL_NEARBY_SEARCH = {
  key: "", requestId: 0, loading: false, hasResult: false,
  places: [], notice: "", error: "",
};

export function nearbySearchKey(origin, radius, category) {
  if (!origin || category === "circles") return "";
  return `${origin.lat}:${origin.lon}:${radius}:${category}`;
}

// Only a retry of the same geographic search may retain an earlier result.
export function currentNearbySearch(state, key) {
  return state.key === key ? state : INITIAL_NEARBY_SEARCH;
}

export function nearbySearchReducer(state, action) {
  if (action.type === "reset") return INITIAL_NEARBY_SEARCH;
  if (action.type === "start") {
    return {
      ...currentNearbySearch(state, action.key),
      key: action.key, requestId: action.requestId, loading: true, error: "",
    };
  }
  // A slow response must not replace results for a newer request, even when
  // the student has returned to the same search after visiting another tab.
  if (state.key !== action.key || state.requestId !== action.requestId) return state;
  if (action.type === "success") {
    if (!Array.isArray(action.data?.places)) {
      return { ...state, loading: false, error: "The nearby service returned an incomplete response. Please retry the search." };
    }
    return {
      ...state, loading: false, hasResult: true, error: "",
      places: action.data.places,
      notice: action.data?.notice || "",
    };
  }
  if (action.type === "failure") {
    return { ...state, loading: false, error: action.error || "Could not load nearby places. Please try again." };
  }
  return state;
}
