from schemas import DistrictResponse, GridCellResponse, InfrastructureResponse, ProgressionResponse

MAP_SIZE = 16
LEVEL_THRESHOLDS = {1: 0, 2: 100, 3: 300}
LEVEL_NAMES = {1: "Homestead", 2: "Village", 3: "Haven"}


def level_for_xp(xp: int) -> int:
    if xp >= LEVEL_THRESHOLDS[3]:
        return 3
    if xp >= LEVEL_THRESHOLDS[2]:
        return 2
    return 1


def district_for_level(level: int) -> DistrictResponse:
    if level >= 3:
        inset = 0
    elif level == 2:
        inset = 2
    else:
        inset = 4
    return DistrictResponse(
        min_x=inset,
        max_x=MAP_SIZE - inset - 1,
        min_y=inset,
        max_y=MAP_SIZE - inset - 1,
    )


def infrastructure_for_level(level: int) -> InfrastructureResponse:
    district = district_for_level(level)
    cells = {
        (coordinate, 7)
        for coordinate in range(district.min_x, district.max_x + 1)
    } | {
        (7, coordinate)
        for coordinate in range(district.min_y, district.max_y + 1)
    }
    tier = "stone" if level >= 3 else "gravel" if level == 2 else "dirt"
    return InfrastructureResponse(
        tier=tier,
        reserved_cells=[GridCellResponse(x=x, y=y) for x, y in sorted(cells)],
    )


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
