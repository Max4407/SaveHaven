from schemas import DistrictResponse, InfrastructureResponse, ProgressionResponse

MAP_COLUMNS = 32
MAP_ROWS = 70
LEVEL_THRESHOLDS = {1: 0, 2: 100, 3: 300}
LEVEL_NAMES = {1: "Homestead", 2: "Village", 3: "Haven"}


def level_for_xp(xp: int) -> int:
    if xp >= LEVEL_THRESHOLDS[3]:
        return 3
    if xp >= LEVEL_THRESHOLDS[2]:
        return 2
    return 1


def district_for_level(level: int) -> DistrictResponse:
    # All levels can build across the whole map; levels unlock catalog items only.
    return DistrictResponse(
        min_x=0,
        max_x=MAP_COLUMNS - 1,
        min_y=0,
        max_y=MAP_ROWS - 1,
    )


def infrastructure_for_level(level: int) -> InfrastructureResponse:
    # Retain the response shape for existing clients without reserving buildable land.
    tier = "stone" if level >= 3 else "gravel" if level == 2 else "dirt"
    return InfrastructureResponse(tier=tier, reserved_cells=[])


def progression_for_xp(xp: int) -> ProgressionResponse:
    level = level_for_xp(xp)
    current = LEVEL_THRESHOLDS[level]
    next_threshold = LEVEL_THRESHOLDS.get(level + 1)
    if next_threshold is None:
        progress = 100
    else:
        progress = round((xp - current) * 100 / (next_threshold - current))
    return ProgressionResponse(
        current_level_xp=current,
        next_level_xp=next_threshold,
        progress_percent=max(0, min(progress, 100)),
    )
