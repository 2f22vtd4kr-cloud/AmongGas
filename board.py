import pygame as pg
import pygame.font

from settings import *

class Board:
    def __init__(self, width: int, height: int, game):
        self.surface = pg.display.set_mode((width, height), 0, 32)
        pg.display.set_caption('Among Us')
        self.width = width
        self.height = height
        self.game = game
        self.intro_bg = pg.image.load("Assets/Images/Menu/back.png").convert_alpha()
        self.intro_bg2 = pg.image.load("Assets/Images/Menu/back2.png").convert_alpha()
        self.intro_title = pg.image.load("Assets/Images/Menu/title.png").convert_alpha()
        self.intro_menu1 = pg.image.load("Assets/Images/Menu/freeplay.png").convert_alpha()
        self.intro_menu2 = pg.image.load("Assets/Images/Menu/online.png").convert_alpha()
        self.intro_menu3 = pg.image.load("Assets/Images/Menu/help.png").convert_alpha()
        self.intro_menu4 = pg.image.load("Assets/Images/Menu/credits.png").convert_alpha()
        self.intro_menu5 = pg.image.load("Assets/Images/Menu/quit.png").convert_alpha()
        self.intro_color1 = pg.image.load("Assets/Images/Menu/blue.png").convert_alpha()
        self.intro_color2 = pg.image.load("Assets/Images/Menu/green.png").convert_alpha()
        self.intro_color3 = pg.image.load("Assets/Images/Menu/yellow.png").convert_alpha()
        self.intro_color4 = pg.image.load("Assets/Images/Menu/red.png").convert_alpha()
        self.intro_color5 = pg.image.load("Assets/Images/Menu/orange.png").convert_alpha()
        self.intro_choosecolour = pg.image.load("Assets/Images/Menu/choosecolour.png").convert_alpha()
        self.intro_return = pg.image.load("Assets/Images/Menu/return.png").convert_alpha()
        self.intro_entername = pg.image.load("Assets/Images/Menu/entername.png").convert_alpha()
        self.intro_enteraddress = pg.image.load("Assets/Images/Menu/enteraddress.png").convert_alpha()
        self.intro_input = pg.image.load("Assets/Images/Menu/input.png").convert_alpha()
        self.intro_help = []
        for i in range(0, 9):
            self.intro_help.append(pygame.image.load('Assets/Images/help/'+'help'+str(i+1)+'.png'))
        self.intro_credits = pg.image.load("Assets/Images/credits/credits.png")
        
        self.menu_font = pg.font.Font(FONT, 35)
        self.bonus_font = pg.font.Font(FONT, 30)
        self.title_font = pg.font.Font(FONT, 90)
        self.game_over_font = pg.font.Font(FONT, 120)
        self.game_left_font = pg.font.Font(FONT, 75)

    def draw_menu(self, *args):
        self.intro_bg = pg.transform.smoothscale(self.intro_bg, (self.width, self.height))
        self.surface.blit(self.intro_bg, (0, 0), (0, 0, self.width, self.height))
        self.intro_title = pg.transform.smoothscale(self.intro_title, (int(self.width / 2), int(self.height * 0.2)))
        self.surface.blit(self.intro_title, (self.width / 4, self.height * 0.1), (0, 0, self.width, self.height))
        for drawable in args:
            drawable.draw_on(self.surface)
        pg.display.update()

    def draw_choose_character(self, *args):
        self.intro_bg2 = pg.transform.smoothscale(self.intro_bg2, (self.width, self.height))
        self.surface.blit(self.intro_bg2, (0, 0), (0, 0, self.width, self.height))
        self.intro_choosecolour = pg.transform.smoothscale(self.intro_choosecolour, (int(self.width / 2), int(self.height * 0.1)))
        self.surface.blit(self.intro_choosecolour, (self.width / 3.9, self.height * 0.05), (0, 0, self.width, self.height))
        for drawable in args:
            drawable.draw_on(self.surface)
        pg.display.update()

    @staticmethod
    def draw_text(surface, text, x, y, font):
        if text is not None:
            text = font.render(text, True, MENU_FONT_COLOR)
            rect = text.get_rect()
            rect.center = x, y
            surface.blit(text, rect)