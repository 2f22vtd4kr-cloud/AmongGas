import time
import pygame as pg
from os import path
import sys
from settings import *
vec = pg.math.Vector2
from os import path
import random

class Player(pg.sprite.Sprite):
    def __init__(self, game, pos, player_id, player_islocal, player_colour):
        self._layer = PLAYER_LAYER
        if player_islocal:
            self.groups = game.all_sprites
        else:
            self.groups = game.all_sprites, game.players_server
        pg.sprite.Sprite.__init__(self, self.groups)
        self.game = game
        self.player_id = player_id
        self.alive_status = True
        self.player_islocal = player_islocal
        self.player_colour = player_colour
        self.image = pg.Surface((64, 86))
        self.rect = self.image.get_rect()
        self.hit_rect = self.rect
        self.vel = vec(0, 0)
        self.pos = vec(pos)
        self.pos_corpse = vec(0, 0)
        self.last_played = 0
        self.now = 0
        self.tasks_completed = 0
        self.victim_id = 0
        self.victim_id_report = 0
        self.imposter = False
        self.voted = None
        self.got_votes = 0
        self.got_reported = False

    def get_keys(self):
        if self.player_islocal == True and self.alive_status == True:
            self.vel = vec(0, 0)
            keys = pg.key.get_pressed()
            if (keys[pg.K_LEFT] or keys[pg.K_a]):
                self.vel.x = - PLAYER_SPEED
            if (keys[pg.K_RIGHT] or keys[pg.K_d]):
                self.vel.x = PLAYER_SPEED
            if (keys[pg.K_UP] or keys[pg.K_w]):
                self.vel.y = - PLAYER_SPEED
            if (keys[pg.K_DOWN] or keys[pg.K_s]):
                self.vel.y = PLAYER_SPEED
            if self.vel.x != 0 and self.vel.y != 0:
                self.vel *= 0.7071

    def collide_with_walls(self, dir):
        if self.alive_status == True:
            if dir == 'x':
                hits = pg.sprite.spritecollide(self, self.game.walls, False)
                if hits:
                    if self.vel.x > 0:
                        self.pos.x = hits[0].rect.left - self.rect.width
                    if self.vel.x < 0:
                        self.pos.x = hits[0].rect.right
                    self.vel.x = 0
                    self.rect.x = self.pos.x
            if dir == 'y':
                hits = pg.sprite.spritecollide(self, self.game.walls, False)
                if hits:
                    if self.vel.y > 0:
                        self.pos.y = hits[0].rect.top - self.rect.height
                    if self.vel.y < 0:
                        self.pos.y = hits[0].rect.bottom
                    self.vel.y = 0
                    self.rect.y = self.pos.y

    def update(self):
        self.get_keys()
        self.pos += self.vel * self.game.dt
        self.rect.x = self.pos.x
        self.collide_with_walls('x')
        self.rect.y = self.pos.y
        self.collide_with_walls('y')

class Bot(pg.sprite.Sprite):
    def __init__(self, game, x, y, bot_direction, bot_type, bot_colour):
        self._layer = BOT_LAYER
        self.groups = game.all_sprites, game.bots
        pg.sprite.Sprite.__init__(self, self.groups)
        self.game = game
        self.alive_status = True
        self.bot_direction = bot_direction
        self.bot_colour = bot_colour
        self.image = pg.Surface((64, 86))
        self.rect = self.image.get_rect()
        self.hit_rect = self.rect
        self.vel = vec(0, 0)
        self.pos = vec(x, y)
        self.type = bot_type
        self.play_kill_count = 0

    def collide_with_walls(self, dir):
        if dir == 'x':
            hits = pg.sprite.spritecollide(self, self.game.walls, False)
            if hits:
                if self.vel.x > 0:
                    self.pos.x = hits[0].rect.left - self.rect.width
                if self.vel.x < 0:
                    self.pos.x = hits[0].rect.right
                self.vel.x = 0
                self.rect.x = self.pos.x
        if dir == 'y':
            hits = pg.sprite.spritecollide(self, self.game.walls, False)
            if hits:
                if self.vel.y > 0:
                    self.pos.y = hits[0].rect.top - self.rect.height
                if self.vel.y < 0:
                    self.pos.y = hits[0].rect.bottom
                self.vel.y = 0
                self.rect.y = self.pos.y

    def update(self):
        self.pos += self.vel * self.game.dt
        self.rect.x = self.pos.x
        self.collide_with_walls('x')
        self.rect.y = self.pos.y
        self.collide_with_walls('y')

class Wall(pg.sprite.Sprite):
    def __init__(self, game, x, y):
        self._layer = WALL_LAYER
        self.groups = game.all_sprites, game.walls
        pg.sprite.Sprite.__init__(self, self.groups)
        self.game = game
        self.image = pg.Surface((TILESIZE, TILESIZE))
        self.rect = self.image.get_rect()
        self.x = x
        self.y = y
        self.rect.x = x * TILESIZE
        self.rect.y = y * TILESIZE

class Obstacle(pg.sprite.Sprite):
    def __init__(self, game, x, y, width, height):
        self.groups = game.walls
        pg.sprite.Sprite.__init__(self, self.groups)
        self.game = game
        self.rect = pg.Rect(x, y, width, height)
        self.x = x
        self.y = y
        self.rect.x = x
        self.rect.y = y

class Item(pg.sprite.Sprite):
    def __init__(self, game, pos, item_type):
        self._layer = ITEM_LAYER
        self.groups = game.all_sprites, game.items
        pg.sprite.Sprite.__init__(self, self.groups)
        self.game = game
        self.image = pg.Surface((32, 32))
        self.rect = self.image.get_rect()
        self.hit_rect = self.rect
        self.type = item_type
        self.rect.center = pos