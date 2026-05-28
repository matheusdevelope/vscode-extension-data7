
Imports mod_pipeline_form
Imports mod_card_controller

'@Module
Namespace mod_card_form

   Class TFormCard
      Inherits TPipelineForm

      Private _card_controller As TCardController

      Sub New(pTitle As String = "Processar retorno de cartões 2")
         me._card_controller = New TCardController()
         Mybase.New(me._card_controller, pTitle)
      End Sub

      Sub Free()
         me._card_controller.Free()
         MyBase.Free()
      End Sub

   End Class

End Namespace