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
      sample_size: 2
      y_axis_factor: 1.2
      y_axis_minimum_size: 100
      y_axis_shrink_factor: .05
      padding_bottom: 48
      padding_top: 48
      bar_spacing: 4
      now_bar_width: 4
      min_time_in_view: 60 * 60 * 1000
      max_time_in_view: 2 * 7 * 24 * 60 * 60 * 1000
      quick_update: 1000
      full_update: 30000
      energy_buffer_size: 10
      remote_url: 'http://localhost:8002/' # 'http://livinglab.powerprojects.se:8002/'
      database: 'http://localhost:5984/sp' # 'https://livinglab.powerprojects.se:6984/sp'
      card_width: 512
      feed: 'allRooms'

    remote = new Remote config.remote_url
    @chart = new Chart config, config.database
    @cardboard = new Cardboard config, innerWidth, innerHeight
