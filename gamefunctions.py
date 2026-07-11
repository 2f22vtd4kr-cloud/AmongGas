import pygame as pg
from settings import *

class GameFunctions:
    def __init__(self, game):
        self.game = game
        self.cafeteria_sound_play_check = True
        self.medbay_sound_play_check = True
        self.security_room_sound_play_check = True
        self.reactor_room_sound_play_check = True
        self.upper_engine_room_sound_play_check = True
        self.lower_engine_room_sound_play_check = True
        self.electrical_room_sound_play_check = True
        self.storage_room_sound_play_check = True
        self.admin_room_sound_play_check = True
        self.communication_room_sound_play_check = True
        self.oxygen_room_sound_play_check = True
        self.cockpit_room_sound_play_check = True
        self.weapons_room_sound_play_check = True
        self.bg_music_playing = True
        self.load_image_data()

    def load_image_data(self):
        self.cafeteria_comp_img = pg.image.load("Assets/Images/Items/cafeteria_comp.png").convert_alpha()
        self.emergency_button_img = pg.image.load("Assets/Images/Items/emergency_button.png").convert_alpha()
        self.nav_img = pg.image.load("Assets/Images/Items/nav.png").convert_alpha()
        self.reactor_btn_img = pg.image.load("Assets/Images/Items/reactor_btn.png").convert_alpha()
        self.lower_engine_img = pg.image.load("Assets/Images/Items/lower_engine.png").convert_alpha()
        self.upper_engine_img = pg.image.load("Assets/Images/Items/upper_engine.png").convert_alpha()
        self.navigation_img = pg.image.load("Assets/Images/Items/navigation.png").convert_alpha()
        self.generator_btn_img = pg.image.load("Assets/Images/Items/generator.png").convert_alpha()

    def load_ambient_sounds(self):
        c = pg.Vector2(3277, 658)
        d = pg.Vector2(self.game.player.pos.x, self.game.player.pos.y)
        if d.distance_to(c) <= CAFETERIA_AMBIENT_DETECT_RADIUS:
            if self.cafeteria_sound_play_check:
                self.game.ambient_sounds['cafeteria'].play(-1, -1, 500)
                self.cafeteria_sound_play_check = False
        else:
            self.game.ambient_sounds['cafeteria'].fadeout(1000)
            self.cafeteria_sound_play_check = True

        i = pygame.Vector2(2338, 1147)
        j = pygame.Vector2(self.game.player.pos.x, self.game.player.pos.y)
        if i.distance_to(j) <= MEDBAY_AMBIENT_DETECT_RADIUS:
            if self.medbay_sound_play_check:
                self.game.ambient_sounds['medbay_room'].play(-1, -1, 500)
                self.medbay_sound_play_check = False
        else:
            self.game.ambient_sounds['medbay_room'].fadeout(1000)
            self.medbay_sound_play_check = True