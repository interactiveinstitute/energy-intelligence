    config =
      work_day_hours: [6, 18]
      default_view_after: 120000
      intervals: [1, 30, 60, 300, 900, 1800, 3600, 10800, 21600, 43200, 86400]
      at_idx: 0
      datastream_idx:
        ElectricPower: 1
        OfficeOccupied: 2
        OfficeTemperature: 3
        ElectricEnergy: 4
        ElectricEnergyOccupied: 5
        ElectricEnergyUnoccupied: 6

    remote = new Remote 'http://livinglab.powerprojects.se:8002/'
    @chart = new Chart config, 'https://livinglab.powerprojects.se:6984/sp'
    Cardboard.db = 'https://livinglab.powerprojects.se:6984/sp'
    Cardboard.feed = 'allRooms'
    Cardboard.width = innerWidth
    Cardboard.height = innerHeight
