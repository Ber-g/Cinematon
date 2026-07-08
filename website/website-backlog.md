What is new in this version and why:

    Animation « Hola » dynamique : Le titre s'anime désormais d'une vague fluide de gauche à droite à intervalles aléatoires (toutes les 5 à 20 secondes) pour ajouter une micro-interaction haut de gamme, tout en restant responsive (seul le « Kiosk » saute sur mobile).

    Isolation graphique des caractères : L'effet de relief 3D hachuré (text-shadow), le contour (-webkit-text-stroke) et la couleur opaque ont été déplacés du bloc parent vers chaque lettre individuellement (span.letter).

Why : Initialement, appliquer l'animation sur des lettres isolées échouait car le text-shadow hérité du conteneur global fusionnait le rendu visuel et bloquait les mouvements indépendants. Ce refactoring CSS permet de dissocier proprement les caractères pour les animer séquentiellement en JavaScript sans briser l'esthétique filaire d'origine.

ajout du background avec vignette + outglow des lettres logo

Ajout des boutons supplémentaires

intégration performante d'une carte de Montréal (Second lite.svg) gérée par un système sur mesure de double masque rectangulaire régulier (linear-gradient avec calc()), ce qui dessine une transition blanche parfaite et réserve une large zone opaque de 500px en bas pour isoler ton footer. Ton logo a gagné en lisibilité au-dessus de ce fond complexe grâce à l'ajout d'une triple couche d'ombrage flou blanc qui crée un halo lumineux protecteur juste en dessous de ton relief hachuré 3D, préservant la netteté absolue de tes tracés noirs. La typographie de ta navigation s'est affinée avec un ciblage précis de la police Libre Bodoni en taille 1rem, tandis que la robustesse de ton responsive a été totalement verrouillée : le masquage mobile de « oscope » est propre et ton script JavaScript filtre désormais dynamiquement les lettres pour que l'animation « Hola » séquentielle s'adapte automatiquement, ne faisant sauter que la marque courte (« Kiosk ») sur téléphone et le mot complet (« Kioskoscope ») sur grand écran.