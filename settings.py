import pygame

# define some colors (R, G, B)
WHITE = (255, 255, 255)
BLACK = (0, 0, 0)
SKYBLUE = (135, 206, 235)
DARKGREY = (40, 40, 40)
LIGHTGREY = (100, 100, 100)
GREEN = (0, 255, 0)
RED = (255, 0, 0)
YELLOW = (255, 255, 0)
Orange = (255, 165, 0)
Brown = (106, 55, 5)
Transparent_Black = (0, 0, 0, 1)
MENU_FONT_COLOR = (255, 255, 255)

# game settings
WIDTH = 1280
HEIGHT = 640
FPS = 60
TITLE = "Multi Player Game"
BGCOLOR = Brown
NO_OF_MISSIONS = 8
NO_OF_BOTS = 9
TILESIZE = 32
GRIDWIDTH = WIDTH / TILESIZE
GRIDHEIGHT = HEIGHT / TILESIZE
FONT = 'Assets/Fonts/Rubik-ExtraBold.TTF'

# Menu setting
INTRO_SPRITE_WIDTH = 40
INTRO_SPRITE_HEIGHT = 40
INTRO_SPRITE_POS_X = 0.37
OPTIONS_SPRITE_WIDTH = 45
OPTIONS_SPRITE_HEIGHT = 45
OPTIONS_SPRITE_POS_X = 0.3

# Player settings
PLAYER_SPEED = 400

# Sprite Layers
WALL_LAYER = 1
PLAYER_LAYER = 2
BOT_LAYER = 1
EFFECTS_LAYER = 3
ITEM_LAYER = 1

# Sound Effects
BG_MUSIC3 = 'Ambience/AMB_Main.wav'

CAFETERIA_AMBIENT_DETECT_RADIUS = 750
MEDBAY_AMBIENT_DETECT_RADIUS = 450
SECURITY_ROOM_AMBIENT_DETECT_RADIUS = 350
REACTOR_ROOM_AMBIENT_DETECT_RADIUS = 450
ENGINE_ROOM_AMBIENT_DETECT_RADIUS = 400
ELECTRICAL_ROOM_AMBIENT_DETECT_RADIUS = 570
STORAGE_ROOM_AMBIENT_DETECT_RADIUS = 580
ADMIN_ROOM_AMBIENT_DETECT_RADIUS = 400
COMMUNICATION_ROOM_AMBIENT_DETECT_RADIUS = 370
OXYGEN_ROOM_AMBIENT_DETECT_RADIUS = 250
COCKPIT_ROOM_AMBIENT_DETECT_RADIUS = 300
WEAPON_ROOM_AMBIENT_DETECT_RADIUS = 400

stepping_rate = 230
FOOTSTEP_SOUNDS = ['Footsteps/Footstep01.wav',
                   'Footsteps/Footstep02.wav',
                   'Footsteps/Footstep03.wav',
                   'Footsteps/Footstep04.wav',
                   'Footsteps/Footstep05.wav',
                   'Footsteps/Footstep06.wav',
                   'Footsteps/Footstep07.wav',
                   'Footsteps/Footstep08.wav']

EFFECT_SOUNDS = {'main_menu_music': 'Background/main_menu_music.mp3',
                 'start_game': 'General/roundstart.wav',
                 'emergency_alarm': 'General/alarm_emergencymeeting.wav',
                 'dead_body_found': 'General/report_Bodyfound.wav',
                 'crises_alarm': 'General/crises.wav',
                 'invisible': 'General/swap.wav',
                 'vent': 'General/vent.wav',
                 'victory_crew': 'General/victory_crew.wav',
                 'victory_imposter': 'General/victory_impostor.wav',
                 'game_left': 'General/victory_disconnect.wav',
                 'fill_gas_can': 'General/gas_can_fill.wav',
                 'pick_gas_can': 'General/pick_up_gas_can.wav',
                 'menu_sel': 'UI/select.wav',
                 'go_back': 'UI/back2.wav',
                 'selected': 'UI/selected2.wav',
                 'pause': 'UI/pause.wav',
                 'backspace': 'UI/backspace.wav',
                 'keypress': 'UI/keypress.wav',
                 'map_click': 'UI/map_btn_click.wav',
                 'task_completed': 'General/task_complete.wav'}

AMBIENT_SOUNDS = {'admin_room': 'Ambience/AMB_Admin.wav',
                  'cafeteria': 'Ambience/AMB_Cafeteria.wav',
                  'cockpit': 'Ambience/AMB_Cockpit.wav',
                  'medbay_room': 'Ambience/AMB_MedbayRoom.wav',
                  'electrical_room': 'Ambience/AMB_ElectricRoom.wav',
                  'u_engine_room': 'Ambience/AMB_EngineRoom.wav',
                  'l_engine_room': 'Ambience/AMB_EngineRoom.wav',
                  'reactor_room': 'Ambience/AMB_ReactorRoom.wav',
                  'security_room': 'Ambience/AMB_SecurityRoom.wav',
                  'storage_room': 'Ambience/AMB_Storage.wav',
                  'oxygen_room': 'Ambience/AMB_Oxygen.wav',
                  'comms3': 'Ambience/AMB_CommsRoom.wav',
                  'weapons': 'Ambience/AMB_Weapons.wav'}

# Visual Effects
LIGHT_MASK = 'light_350_med.png'
LIGHT_RADIUS = (500, 500)
NIGHT_COLOR = (20, 20, 20)

# Bots Position
BOT_POS = [(5401, 1530), (3686, 1857), (3733, 2626), (2325, 1814),
           (1718, 1282), (1288, 2418), (1249, 506), (2513, 1286)]

MAP_BUTTON = "UI/map_button.png"

# Tasks Setting
DETECT_RADIUS = 250
DETECT_RADIUS_SABOTAGE_FIX = 50
STABILIZE_NAV_RADIUS = 140
EMPTY_GARBAGE_RADIUS = 70
REBOOT_WIFI_RADIUS = 50
FIX_ELECTRICITY_WIRES_RADIUS = 50
VIEW_ADMIN_MAP_CONTROL_RADIUS = 85
VIEW_SECURITY_MONITOR_RADIUS = 170
DIVERT_POWER_TOP_REACTOR_RADIUS = 50
ALIGN_ENGINE_OUTPUT = 50
PICK_STORAGE_GAS_CAN_RADIUS = 50
FUEL_ENGINE = 50

# Pygame Mouse Button Codes
LEFT_MOUSE_BUTTON = 1
MIDDLE_MOUSE_BUTTON = 2
RIGHT_MOUSE_BUTTON = 3