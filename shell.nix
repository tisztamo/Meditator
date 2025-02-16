{ pkgs ? import (fetchTarball "https://github.com/NixOS/nixpkgs/archive/0bf3109eeb61780965c27f4a0a4affdcd0cd4d3d.tar.gz") {}
}:

pkgs.mkShell {
  buildInputs = [
    pkgs.git
    pkgs.tmux
    pkgs.htop
    pkgs.glow
    pkgs.unzip
  ];

  shellHook = ''
    HEAD_COLOR="\033[0;32m";
    NO_COLOR="\033[0m";

    printf "$HEAD_COLOR\n"
    echo "------------------- Meditator dev environment --------------------"
    echo "- You need to install bun manually as the nix package has issues -"
    echo "- To install bun: curl -fsSL https://bun.sh/install | bash       -"
    echo "------------------------------------------------------------------"
    printf "$NO_COLOR"

  '';

}
