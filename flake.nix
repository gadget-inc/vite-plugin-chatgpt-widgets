{
  description = "Gadget js-clients development environment";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-25.05";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachSystem [ "x86_64-linux" "x86_64-darwin" "aarch64-darwin" ] (system:
      let
        pkgs = import nixpkgs { inherit system; };
        node = pkgs.nodejs_22;
      in {
        packages = {
          nodejs = node;
          corepack = pkgs.corepack;
          git = pkgs.git;
        };

        devShells.default = pkgs.mkShell {
          packages = with pkgs; [ node corepack git ];
        };
      });
}
