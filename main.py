from game import Game

while True:
    g = Game()
    print("Tasks done: " + str(g.missions_done))
    g.menu.game_intro()
    del g